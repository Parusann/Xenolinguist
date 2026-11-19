"""Run a three-update lexical LoRA feasibility pilot and replay its final update."""

import argparse
import gc
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import time

import peft
import psutil
import torch
import transformers
from peft import LoraConfig, PeftModel, get_peft_model, get_peft_model_state_dict
from transformers import AutoModelForCausalLM, AutoTokenizer


MODEL_REVISION = 'cdbee75f17c01a7cc42f958dc650907174af0554'
TRAINING_HASH = 'ffc0329e46768e4dcf685fd1740633e225ed688aeaa0f1c7fe75fdd365c104dc'
GIB = 1024 ** 3


def require_child(candidate, parent):
    resolved = Path(candidate).resolve()
    if resolved == parent or not resolved.is_relative_to(parent):
        raise ValueError(f'Expected a path inside {parent}')
    return resolved


def verify_base(directory):
    lock = json.loads(Path(__file__).with_name('base-lock.json').read_text(encoding='utf-8-sig'))
    if lock['sha'] != MODEL_REVISION or directory.name != MODEL_REVISION:
        raise ValueError('Base revision mismatch')
    for entry in lock['files']:
        filename = require_child(directory / entry['rfilename'], directory)
        if filename.stat().st_size != entry['size']:
            raise ValueError(f'Base file size changed: {filename.name}')
        with filename.open('rb') as handle:
            if entry['lfs']:
                digest = hashlib.file_digest(handle, 'sha256').hexdigest()
                expected = entry['lfs']['sha256']
            else:
                digest = hashlib.sha1(f"blob {entry['size']}\0".encode() + handle.read()).hexdigest()
                expected = entry['blobId']
        if digest != expected:
            raise ValueError(f'Base file integrity check failed: {filename.name}')


def training_examples(directory):
    filename = require_child(directory / 'examples.jsonl', directory)
    if filename.stat().st_size > 2 * 1024 * 1024:
        raise ValueError('Training fixture exceeds expected size')
    raw = filename.read_bytes()
    if hashlib.sha256(raw).hexdigest() != TRAINING_HASH:
        raise ValueError('Expected the verified synthetic training split')
    return [json.loads(line)['messages'] for line in raw.splitlines()]


def token_pair(tokenizer, messages):
    prefix = tokenizer.apply_chat_template(messages[:-1], tokenize=False, add_generation_prompt=True)
    prompt_ids = tokenizer.encode(prefix, add_special_tokens=False)
    target_ids = tokenizer.encode(messages[-1]['content'], add_special_tokens=False) + [tokenizer.eos_token_id]
    if not prompt_ids or not target_ids or len(prompt_ids) + len(target_ids) > 1536:
        raise ValueError('Training example exceeds the pilot token limit')
    return torch.tensor([prompt_ids + target_ids]), torch.tensor(target_ids), len(prompt_ids)


def supervised_loss(model, example):
    inputs, target, prefix_length = example
    # Each target token is predicted by the preceding position. Prompt tokens earn no loss.
    positions = torch.arange(prefix_length - 1, inputs.shape[1] - 1)
    logits = model(input_ids=inputs, logits_to_keep=positions, use_cache=False).logits[0]
    if logits.shape[0] != len(target):
        raise ValueError('Supervision alignment mismatch')
    return torch.nn.functional.cross_entropy(logits.float(), target)


def parameter_digest(model):
    checksum = hashlib.sha256()
    for name, value in sorted(get_peft_model_state_dict(model).items()):
        checksum.update(name.encode())
        checksum.update(value.detach().cpu().contiguous().view(torch.uint8).numpy().tobytes())
    return checksum.hexdigest()


def optimizer_for(model):
    trainable = [p for p in model.parameters() if p.requires_grad]
    return torch.optim.AdamW(trainable, lr=0.0001, weight_decay=0.0, foreach=False)


def load_base(directory):
    return AutoModelForCausalLM.from_pretrained(directory, local_files_only=True, trust_remote_code=False,
                                               dtype=torch.bfloat16, attn_implementation='sdpa')


def step(model, optimizer, example):
    started = time.perf_counter()
    model.train()
    optimizer.zero_grad(set_to_none=True)
    loss = supervised_loss(model, example)
    loss.backward()
    params = [p for p in model.parameters() if p.requires_grad]
    grad_norm = float(torch.nn.utils.clip_grad_norm_(params, max_norm=1.0))
    value = float(loss.detach())
    if not math.isfinite(value) or not math.isfinite(grad_norm) or grad_norm <= 0:
        raise ValueError('Non-finite loss or absent gradient')
    optimizer.step()
    return {'seconds': time.perf_counter() - started, 'loss': value, 'gradientNorm': grad_norm,
            'inputTokens': example[0].shape[1], 'supervisedTokens': len(example[1])}


def save_report(output, record):
    staging = output / 'status.tmp'
    staging.write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    staging.replace(output / 'status.json')


def run(base_dir, data_dir, output, threads):
    before = psutil.virtual_memory().available
    if before < 12 * GIB:
        raise RuntimeError('The 4B CPU pilot requires 12 GiB available RAM at launch')
    if psutil.disk_usage(str(output.parent)).free < 20 * GIB:
        raise RuntimeError('Insufficient research-drive headroom')
    output.mkdir(exist_ok=False)
    record = {'status': 'running', 'base': 'Qwen/Qwen3-4B-Instruct-2507', 'revision': MODEL_REVISION,
              'trainingHash': TRAINING_HASH, 'backend': 'CPU', 'baseDtype': 'bfloat16', 'threads': threads,
              'seed': 17, 'rank': 4, 'alpha': 8, 'layer': 35, 'targetModules': ['q_proj', 'v_proj'],
              'initialAvailableRamBytes': before, 'versions': {'python': sys.version.split()[0], 'torch': torch.__version__,
              'peft': peft.__version__, 'transformers': transformers.__version__}, 'steps': []}
    save_report(output, record)
    try:
        verify_base(base_dir)
        examples = training_examples(data_dir)
        torch.manual_seed(17)
        torch.set_num_threads(threads)
        torch.set_num_interop_threads(1)
        process = psutil.Process()
        process.nice(psutil.BELOW_NORMAL_PRIORITY_CLASS)
        started = time.perf_counter()
        tokenizer = AutoTokenizer.from_pretrained(base_dir, local_files_only=True, trust_remote_code=False)
        batches = [token_pair(tokenizer, messages) for messages in examples[:3]]
        base = load_base(base_dir)
        model = get_peft_model(base, LoraConfig(task_type='CAUSAL_LM', r=4, lora_alpha=8, lora_dropout=0,
                              layers_to_transform=[35], target_modules=['q_proj', 'v_proj'], bias='none'))
        record['loadSeconds'] = time.perf_counter() - started
        trainable, total = model.get_nb_trainable_parameters()
        record.update(trainableParameters=trainable, totalParameters=total)
        if not 0 < trainable < total // 100:
            raise RuntimeError('Unexpected trainable parameter count')
        optimizer = optimizer_for(model)
        initial = parameter_digest(model)
        for batch in batches[:2]:
            record['steps'].append(step(model, optimizer, batch))
            save_report(output, record)
        saved = parameter_digest(model)
        if initial == saved:
            raise RuntimeError('Adapter did not update')
        checkpoint = output / 'checkpoint-2'
        model.save_pretrained(checkpoint, safe_serialization=True, save_embedding_layers=False)
        torch.save({'optimizer': optimizer.state_dict(), 'rng': torch.random.get_rng_state(), 'step': 2}, checkpoint / 'resume.pt')
        reference = step(model, optimizer, batches[2])
        uninterrupted = parameter_digest(model)
        # Read the base and adapter from disk again so recovery cannot inherit in-memory parameters.
        del model, optimizer, base
        gc.collect()
        model = PeftModel.from_pretrained(load_base(base_dir), checkpoint, is_trainable=True)
        if parameter_digest(model) != saved:
            raise RuntimeError('Reloaded parameters differ from the saved adapter')
        optimizer = optimizer_for(model)
        state = torch.load(checkpoint / 'resume.pt', map_location='cpu', weights_only=True)
        optimizer.load_state_dict(state['optimizer'])
        torch.random.set_rng_state(state['rng'])
        if state['step'] != 2:
            raise RuntimeError('Resume index mismatch')
        resumed = step(model, optimizer, batches[state['step']])
        final = parameter_digest(model)
        if final != uninterrupted or resumed['loss'] != reference['loss'] or final == saved:
            raise RuntimeError('Resumed update differs from uninterrupted update')
        record['steps'].append(resumed)
        model.save_pretrained(output / 'resumed-adapter', safe_serialization=True, save_embedding_layers=False)
        record.update(status='complete', initialAdapterHash=initial, savedAdapterHash=saved, finalAdapterHash=final,
                      uninterruptedAdapterHash=uninterrupted, uninterruptedStep=reference,
                      peakWorkingSetBytes=process.memory_info().peak_wset, availableRamAfterBytes=psutil.virtual_memory().available,
                      artifactBytes=sum(p.stat().st_size for p in output.rglob('*') if p.is_file() and p.name != 'status.json'))
        save_report(output, record)
        print(json.dumps(record, indent=2), flush=True)
    except Exception as exc:
        record.update(status='failed', error=f'{type(exc).__name__}: {exc}')
        save_report(output, record)
        raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    parser.add_argument('--threads', type=int, choices=range(1, 7), default=4)
    args = parser.parse_args()
    root = Path(os.environ['XENO_RESEARCH_ROOT']).resolve()
    require_child(sys.executable, root)
    training = require_child(root / 'data/training', root)
    run(require_child(training / 'base' / MODEL_REVISION, training), require_child(training / 'lexical-supervision-1', training),
        require_child(args.output, training), args.threads)
