"""Train the preregistered lexical candidate once and retain its final weights."""

import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cpu_pilot import (GIB, MODEL_REVISION, TRAINING_HASH, AutoTokenizer, LoraConfig,
                       get_peft_model, load_base, optimizer_for, parameter_digest, psutil,
                       require_child, save_report, step, token_pair, torch, training_examples, verify_base)


def run():
    root = Path(os.environ['XENO_RESEARCH_ROOT']).resolve()
    require_child(sys.executable, root)
    training = require_child(root / 'data/training', root)
    base_dir = require_child(training / 'base' / MODEL_REVISION, training)
    output = require_child(training / 'lexical-candidate-v1', training)
    recipe_file = Path(__file__).resolve().parents[2] / 'evaluation/protocols/lexical-candidate-recipe-v1.json'
    recipe = json.loads(recipe_file.read_text(encoding='utf-8'))
    if recipe['revision'] != MODEL_REVISION or recipe['trainingSha256'] != TRAINING_HASH:
        raise ValueError('Recipe differs from the verified pilot inputs')
    if recipe['epochs'] != 1 or recipe['batchSize'] != 1 or recipe['updates'] != 48:
        raise ValueError('Unexpected candidate schedule')
    if psutil.virtual_memory().available < 12 * GIB or shutil.disk_usage(training).free < 45 * GIB:
        raise RuntimeError('Candidate requires 12 GiB available RAM and 45 GiB available HDD space')
    verify_base(base_dir)
    examples = training_examples(require_child(training / 'lexical-supervision-1', training))
    if len(examples) != recipe['updates']:
        raise ValueError('Candidate schedule differs from training fixture')
    output.mkdir(exist_ok=False)
    record = {'status': 'running', 'recipe': recipe, 'steps': [], 'initialAvailableRamBytes': psutil.virtual_memory().available}
    save_report(output, record)
    try:
        torch.manual_seed(recipe['seed'])
        torch.set_num_threads(recipe['threads'])
        torch.set_num_interop_threads(1)
        process = psutil.Process()
        process.nice(psutil.BELOW_NORMAL_PRIORITY_CLASS)
        tokenizer = AutoTokenizer.from_pretrained(base_dir, local_files_only=True, trust_remote_code=False)
        batches = [token_pair(tokenizer, messages) for messages in examples]
        config = LoraConfig(task_type='CAUSAL_LM', r=recipe['rank'], lora_alpha=recipe['alpha'],
                            lora_dropout=recipe['dropout'], layers_to_transform=[recipe['layer']],
                            target_modules=recipe['targetModules'], bias='none')
        model = get_peft_model(load_base(base_dir), config)
        optimizer = optimizer_for(model)
        if optimizer.param_groups[0]['lr'] != recipe['learningRate'] or optimizer.param_groups[0]['weight_decay'] != recipe['weightDecay']:
            raise ValueError('Optimizer differs from frozen recipe')
        initial = parameter_digest(model)
        record['initialAdapterHash'] = initial
        record['trainableParameters'], record['totalParameters'] = model.get_nb_trainable_parameters()
        started = time.perf_counter()
        for index, batch in enumerate(batches):
            update = step(model, optimizer, batch)
            record['steps'].append(update)
            save_report(output, record)
            if (index + 1) % 8 == 0:
                print(f"Update {index + 1}/{len(batches)}. Loss {update['loss']:.4f}.", flush=True)
        record['trainingSeconds'] = time.perf_counter() - started
        final_hash = parameter_digest(model)
        if initial == final_hash:
            raise RuntimeError('Candidate parameters did not change')
        record['finalAdapterHash'] = final_hash
        adapter_dir = output / 'adapter'
        model.save_pretrained(adapter_dir, safe_serialization=True, save_embedding_layers=False)
        torch.save({'optimizer': optimizer.state_dict(), 'rng': torch.random.get_rng_state(), 'step': len(batches)}, adapter_dir / 'resume.pt')
        merged = model.merge_and_unload(safe_merge=True)
        merged_dir = output / 'merged'
        merged.save_pretrained(merged_dir, max_shard_size='2GB')
        # Copy the exact base tokenizer, generation defaults and license to both sides of the comparison.
        for filename in ('tokenizer_config.json', 'tokenizer.json', 'vocab.json', 'merges.txt', 'generation_config.json', 'LICENSE'):
            shutil.copyfile(base_dir / filename, merged_dir / filename)
        files = []
        for directory in (adapter_dir, merged_dir):
            for file in sorted(directory.iterdir()):
                if file.is_file():
                    with file.open('rb') as handle:
                        sha = hashlib.file_digest(handle, 'sha256').hexdigest()
                    files.append({'path': file.relative_to(output).as_posix(), 'size': file.stat().st_size, 'sha256': sha})
        record.update(status='complete', files=files, peakWorkingSetBytes=process.memory_info().peak_wset)
        save_report(output, record)
        print(f"Fixed candidate {final_hash} after {len(batches)} updates.", flush=True)
    except Exception as error:
        record.update(status='failed', error=f'{type(error).__name__}: {error}')
        save_report(output, record)
        raise


if __name__ == '__main__':
    run()
