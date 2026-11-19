import { parentPort, workerData } from 'node:worker_threads';
import { compareLanguages } from '../../../engine/src/comparison/compare.js';

if (!parentPort) throw new Error('Run comparison computation inside its bounded worker');
parentPort.postMessage(compareLanguages(workerData.input, workerData.references));
