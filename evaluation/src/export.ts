import fs from 'node:fs/promises';
import path from 'node:path';
import { dataset, learnerView, splitManifest } from './generator/dataset.js';

// Research artifacts deliberately separate the learner's input from scorer-owned answer keys.
const manifest = splitManifest();
const directory = path.resolve('test-results', `compiler-${manifest.sha256.slice(0, 12)}`);
await fs.mkdir(directory, { recursive: true });
await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
for (const split of manifest.splits) {
  const learner = path.join(directory, split.name, 'learner'), scorer = path.join(directory, split.name, 'scorer');
  await fs.mkdir(learner, { recursive: true }); await fs.mkdir(scorer, { recursive: true });
  for (let i = 0; i < split.records.length; i++) {
    const record = split.records[i], data = dataset(record.seed, record.family);
    const filename = `language-${i}.json`; // Learner filenames carry no seeds.
    await fs.writeFile(path.join(learner, filename), JSON.stringify(learnerView(data)) + '\n');
    await fs.writeFile(path.join(scorer, filename), JSON.stringify(data) + '\n');
  }
}
console.log(`Exported 90 languages to ${directory}\nManifest SHA-256: ${manifest.sha256}\nProvide only learner files to learners. Keep manifests and scorer files in the evaluation runner.`);
