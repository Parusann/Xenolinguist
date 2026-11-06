"""Verify the merged tensor delta and import a matched local Ollama model pair."""

import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import urllib.request


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def sha_file(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def tensors(directory, expected_shards):
    table = {}
    if {p.name for p in directory.glob('*.safetensors')} != set(expected_shards):
        raise ValueError('Unexpected weight shard set')
    for shard in sorted(directory.glob('*.safetensors')):
        with shard.open('rb') as stream:
            prefix = stream.read(8)
            length, = struct.unpack('<Q', prefix)
            if length > 100_000_000:
                raise ValueError('Oversized tensor header')
            raw_header = stream.read(length)
            header = json.loads(raw_header)
            shard_hash = hashlib.sha256(prefix + raw_header)
            for key, entry in sorted(((k, v) for k, v in header.items() if k != '__metadata__'),
                                     key=lambda pair: pair[1]['data_offsets'][0]):
                start, end = entry['data_offsets']
                if key in table or start < 0 or end < start:
                    raise ValueError('Invalid tensor map')
                if stream.tell() != 8 + length + start:
                    raise ValueError('Non-contiguous tensor layout')
                digest = hashlib.sha256()
                remaining = end - start
                while remaining:
                    chunk = stream.read(min(remaining, 4 * 1024 * 1024))
                    if not chunk:
                        raise ValueError('Truncated tensor')
                    digest.update(chunk)
                    shard_hash.update(chunk)
                    remaining -= len(chunk)
                table[key] = (entry['dtype'], entry['shape'], digest.hexdigest())
            if stream.read(1) or shard_hash.hexdigest() != expected_shards[shard.name]:
                raise ValueError('Unverified weight shard: ' + shard.name)
    if not table:
        raise ValueError('No tensors found')
    return table


def api(route, payload=None):
    request = urllib.request.Request('http://127.0.0.1:11435/api/' + route,
                                     data=None if payload is None else json.dumps(payload).encode(),
                                     headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def run():
    root = Path(os.environ['XENO_RESEARCH_ROOT']).resolve()
    train = root / 'data/training'
    candidate = train / 'lexical-candidate-v1'
    status = read_json(candidate / 'status.json')
    recipe = read_json(Path(__file__).resolve().parents[2] / 'evaluation/protocols/lexical-candidate-recipe-v1.json')
    if status['status'] != 'complete' or status['recipe'] != recipe or len(status['steps']) != recipe['updates']:
        raise ValueError('Incomplete candidate or changed recipe')
    base = train / 'base' / recipe['revision']
    merged = candidate / 'merged'
    runtime = read_json(root / 'config/ollama-research-runtime.json')
    if (os.environ.get('OLLAMA_HOST') != '127.0.0.1:11435' or
        Path(os.environ['OLLAMA_MODELS']).resolve() != root / 'data/models' or
        sha_file(Path(runtime['executable'])) != runtime['executableSha256']):
        raise ValueError('Expected the pinned loopback research runtime')
    if shutil.disk_usage(root).free < 55 * 1024**3:
        raise RuntimeError('Insufficient space for model import and HDD headroom')
    merged_shards = {}
    for file in status['files']:
        p = (candidate / file['path']).resolve()
        if not p.is_relative_to(candidate):
            raise ValueError('Unexpected export path')
        if p.parent == merged and p.suffix == '.safetensors':
            merged_shards[p.name] = file['sha256']
        elif sha_file(p) != file['sha256']:
            raise ValueError('Candidate export differs from its training manifest')
    lock = read_json(Path(__file__).with_name('base-lock.json'))
    if lock['sha'] != recipe['revision']:
        raise ValueError('Pinned base revision differs')
    base_shards = {}
    for file in lock['files']:
        p = base / file['rfilename']
        if p.suffix == '.safetensors':
            base_shards[p.name] = file['lfs']['sha256']
            continue
        elif file['lfs']:
            verified = sha_file(p) == file['lfs']['sha256']
        else:
            data = p.read_bytes()
            verified = hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest() == file['blobId']
        if not verified:
            raise ValueError('Unverified upstream base')
    original, trained = tensors(base, base_shards), tensors(merged, merged_shards)
    if original.keys() != trained.keys() or any(original[k][:2] != trained[k][:2] for k in original):
        raise ValueError('Merged architecture or tensor precision changed')
    changed = sorted(k for k in original if original[k][2] != trained[k][2])
    expected = sorted(f"model.layers.{recipe['layer']}.self_attn.{name}.weight" for name in recipe['targetModules'])
    if changed != expected:
        raise ValueError(f'Unexpected merged weight changes: {changed}')
    out = candidate / 'ollama-import'
    out.mkdir(exist_ok=True)
    version = api('version')['version']
    record = {'ollamaVersion': version, 'baseRevision': lock['sha'], 'adapterHash': status['finalAdapterHash'],
              'recipe': recipe, 'tensorCount': len(original), 'changedTensors': changed}
    converter_lock = read_json(Path(__file__).with_name('converter-lock.json'))
    converter_root = root / 'runtime' / converter_lock['directory']
    revision = subprocess.check_output(['git', '-C', str(converter_root), 'rev-parse', 'HEAD'], text=True).strip()
    modified = subprocess.check_output(['git', '-C', str(converter_root), 'status', '--porcelain', '--untracked-files=no'], text=True)
    if revision != converter_lock['revision'] or modified:
        raise ValueError('Converter source differs from its pinned revision')
    record['conversion'] = converter_lock
    for arm, weights, key in [('base', base, lock['sha']), ('candidate', merged, status['finalAdapterHash'])]:
        # Both imports use the exact upstream architecture, tokenizer and generation metadata.
        stage = out / arm
        stage.mkdir(exist_ok=True)
        for src in [*weights.glob('*.safetensors'), weights / 'model.safetensors.index.json', *(base / name for name in
                    ('config.json', 'tokenizer.json', 'tokenizer_config.json', 'merges.txt', 'vocab.json', 'generation_config.json'))]:
            dest = stage / src.name
            if dest.exists():
                if not os.path.samefile(src, dest):
                    raise ValueError('Unexpected staged import file')
            else:
                os.link(src, dest)
        gguf = out / (arm + '.bf16.gguf')
        receipt = out / (arm + '.conversion.json')
        if receipt.exists():
            if read_json(receipt) != {'sha256': sha_file(gguf), 'conversion': converter_lock}:
                raise ValueError('Converted artifact differs from recorded bytes')
        else:
            partial = out / (arm + '.bf16.gguf.partial')
            if partial.exists() or gguf.exists():
                raise ValueError('An unfinished conversion needs inspection before retry')
            print(f'Converting {arm} with pinned llama.cpp to BF16', flush=True)
            with (out / (arm + '.conversion.log')).open('ab') as log:
                subprocess.run([sys.executable, '-B', str(converter_root / 'convert_hf_to_gguf.py'), str(stage),
                                '--outfile', str(partial), '--outtype', 'bf16', '--model-name', 'XenoLexicalComparison'],
                               stdout=log, stderr=log, check=True)
            partial.rename(gguf)
            receipt.write_text(json.dumps({'sha256': sha_file(gguf), 'conversion': converter_lock}, indent=2) + '\n', encoding='utf-8')
        record[arm + 'Gguf'] = read_json(receipt)
        model_file = out / (arm + '.Modelfile')
        license_text = (base / 'LICENSE').read_text(encoding='utf-8')
        model_file.write_text(f'FROM "{gguf.as_posix()}"\nLICENSE """{license_text}"""\n', encoding='utf-8')
        tag = f'xeno-lexical-{arm}:{key[:16]}'
        print(f'Importing {arm} into {tag}', flush=True)
        with (out / (arm + '.log')).open('ab') as log:
            subprocess.run([runtime['executable'], 'create', tag, '-f', str(model_file)],
                           stdout=log, stderr=log, check=True)
        tag_info = next(t for t in api('tags')['models'] if t['name'] == tag)
        record[arm] = {'name': tag, 'digest': tag_info['digest']}
    output = out / 'imports.json'
    if output.exists() and read_json(output) != record:
        raise ValueError('Existing import record differs')
    output.write_text(json.dumps(record, indent=2) + '\n', encoding='utf-8')
    print(f'Verified {len(original)} tensors. Differences: {changed}', flush=True)


if __name__ == '__main__':
    run()
