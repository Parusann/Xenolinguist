"""Prepare a pinned, non-commercial L2-ARCTIC pilot; downloads remain outside Git."""
import hashlib, json, re, urllib.request, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'test-results/l2-arctic'
OUT = ROOT / 'evaluation/fixtures/audio/l2-arctic-pilot'
REV = 'cc02fd37197966e5de11ad737f7affd577c61992'
BASE = 'https://huggingface.co/datasets/chikingsley/l2-arctic-release-v5.0/resolve/' + REV + '/'
ARCHIVES = {'ASI': '302dc53af870acb8378c2c8205062fb7af1b3ad8ebc61826f87faf7d3dc4e8ff', 'LXC': '3030bd78995f59e9b4af5da17836ad9f00573d3b4f8d79c7cd10ea8d40c79bc0'}
sha = lambda b: hashlib.sha256(b).hexdigest()

def fetch(name, expected):
    p = CACHE / name
    if not p.exists(): urllib.request.urlretrieve(BASE + name, p)
    if sha(p.read_bytes()) != expected: raise ValueError('Source checksum mismatch: ' + name)
    return p

def tier(text, name):
    blocks = re.split(r'\n\s*item \[\d+\]:', text)
    found = [b for b in blocks if re.search(r'name = "' + name + '"', b)]
    if len(found) != 1: raise ValueError('Expected one ' + name + ' tier')
    spans = [{'start': float(a), 'end': float(b), 'label': c.replace('""', '"')} for a,b,c in re.findall(r'xmin = ([\d.]+)\s+xmax = ([\d.]+)\s+text = "((?:[^"]|"")*)"', found[0])]
    expected = int(re.search(r'intervals: size = (\d+)', found[0])[1])
    if len(spans) != expected: raise ValueError('Incomplete tier')
    return spans

def main():
    CACHE.mkdir(parents=True, exist_ok=True); OUT.mkdir(parents=True, exist_ok=True)
    license_file = fetch('LICENSE', 'b1d636fddd729d8185d89af1e41e21a311866fcf3d4040cc4906a64837d0f218')
    (OUT / 'LICENSE').write_bytes(license_file.read_bytes())
    cases, seen = [], set()
    for speaker, digest in ARCHIVES.items():
        with zipfile.ZipFile(fetch(speaker + '.zip', digest)) as z:
            names = sorted(n for n in z.namelist() if n.startswith(speaker + '/annotation/') and n.endswith('.TextGrid'))
            selected = [n for n in names if Path(n).stem not in seen][:12]
            if len(selected) != 12: raise ValueError('Incomplete selection')
            for n in selected:
                stem = Path(n).stem; seen.add(stem); identifier = speaker + '-' + stem
                annotation, wav = z.read(n), z.read(speaker + '/wav/' + stem + '.wav')
                for suffix, data in [('.TextGrid', annotation), ('.wav', wav)]: (OUT / (identifier + suffix)).write_bytes(data)
                decoded = annotation.decode('utf8')
                cases.append({'id': identifier, 'speaker': speaker, 'split': 'development' if speaker == 'ASI' else 'evaluation',
                    'original': {'file': identifier + '.wav', 'sha256': sha(wav)}, 'annotation': {'file': identifier + '.TextGrid', 'sha256': sha(annotation)},
                    'phones': tier(decoded, 'phones'), 'words': tier(decoded, 'words')})
    manifest = {'version': 'l2-arctic-pilot-v1', 'source': 'https://psi.engr.tamu.edu/l2-arctic-corpus/', 'mirror': BASE, 'archiveSha256': ARCHIVES,
        'license': 'CC-BY-NC-4.0', 'licenseSha256': sha(license_file.read_bytes()), 'selection': 'First 12 sorted manual annotations from ASI; first 12 from LXC excluding ASI prompt IDs. No inference-based selection or exclusion.', 'cases': cases}
    (OUT / 'corpus.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8')
    print(json.dumps({'cases': len(cases), 'bytes': sum(p.stat().st_size for p in OUT.iterdir())}))

if __name__ == '__main__': main()
