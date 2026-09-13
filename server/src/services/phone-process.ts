import { fork } from 'node:child_process';
import path from 'node:path';
import type { IpaResult } from '../../../shared/types.js';
import { IpaBadInputError, IpaUnavailableError, wavToFloat32 } from './ipa-phones.js';
import { ipaModelDir } from '../config.js';

/** A disposable native process makes in-flight ONNX work terminable, not merely hidden. */
export function runPhones(wav: Buffer, signal: AbortSignal, onStarted?: () => void): Promise<IpaResult> {
  wavToFloat32(wav); signal.throwIfAborted();
  if (!ipaModelDir()) throw new IpaUnavailableError('Phone model is not configured', 'IPA_MODEL_MISSING');
  const source = import.meta.dirname;
  const entry = source ? path.join(source, 'phone-process-entry.ts') : path.join(__dirname.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1'), 'phone-process.cjs');
  return new Promise((resolve, reject) => {
    const child = fork(entry, [], { execArgv: source ? ['--import', 'tsx'] : [],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    let result: IpaResult | undefined, failure: Error | undefined;
    child.once('spawn', () => onStarted?.());
    const abort = () => { child.kill('SIGKILL'); };
    signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
    child.stderr?.on('data', () => {});
    child.on('message', (message: { result?: IpaResult; error?: { name: string; code?: string } }) => {
      result = message.result;
      if (message.error) failure = message.error.name === 'IpaBadInputError' ? new IpaBadInputError('Unsupported audio') : new IpaUnavailableError('Phone inference unavailable', message.error.code);
    });
    child.once('error', () => { failure = new IpaUnavailableError('Phone process could not start', 'IPA_NATIVE_LOAD_FAILED'); });
    child.once('close', () => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted) reject(signal.reason);
      else if (failure) reject(failure);
      else if (result) resolve(result);
      else reject(new IpaUnavailableError('Phone process exited without a result', 'IPA_INFERENCE_FAILED'));
    });
    child.send({ wav: wav.toString('base64') }, error => { if (error) { failure = error; child.kill(); } });
  });
}
