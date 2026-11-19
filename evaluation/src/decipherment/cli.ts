import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { exportCorpus, verifyCorpus } from './archive.js';
import { auditSplits, createCorpus } from './corpus.js';

export async function main(args: string[]) {
  const [mode, splitOrDirectory, directory] = args;
  if (mode === 'audit' && args.length === 1)
    return auditSplits({ train: createCorpus('train'), development: createCorpus('development'), final: createCorpus('final') });
  if (mode === 'verify' && args.length === 2) return verifyCorpus(path.resolve(splitOrDirectory));
  if (mode === 'export' && args.length === 3 && ['train', 'development'].includes(splitOrDirectory))
    return exportCorpus(splitOrDirectory as 'train' | 'development', path.resolve(directory));
  throw new Error('Usage: audit | export <train|development> <new-directory> | verify <directory>. Reserved final export is disabled.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main(process.argv.slice(2)).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error); process.exitCode = 1; });
