import { describe, it, expect, afterEach } from 'vitest';
import path from 'path';

afterEach(() => {
  delete process.env.DATA_DIR;
  delete process.env.OLLAMA_MODEL;
  delete process.env.CLIENT_DIST;
  delete process.env.ESPEAK_PATH;
  delete process.env.WHISPER_BIN;
  delete process.env.WHISPER_MODEL;
  delete process.env.IPA_MODEL_DIR;
});

describe('config', () => {
  it('dataDir honors DATA_DIR env', async () => {
    process.env.DATA_DIR = path.join('/tmp', 'xeno-test');
    const { dataDir } = await import('../config.js?case=1');
    expect(dataDir()).toBe(path.resolve('/tmp', 'xeno-test'));
  });

  it('dataDir falls back to server/data when unset', async () => {
    const { dataDir } = await import('../config.js?case=2');
    expect(dataDir().replace(/\\/g, '/')).toMatch(/\/data$/);
  });

  it('defaultModel honors OLLAMA_MODEL, defaults to gemma4:e4b', async () => {
    const { defaultModel } = await import('../config.js?case=3');
    expect(defaultModel()).toBe('gemma4:e4b');
    process.env.OLLAMA_MODEL = 'llama3.1:8b';
    expect(defaultModel()).toBe('llama3.1:8b');
  });

  it('clientDist returns CLIENT_DIST or null', async () => {
    const { clientDist } = await import('../config.js?case=4');
    expect(clientDist()).toBeNull();
    process.env.CLIENT_DIST = '/app/client/dist';
    expect(clientDist()).toBe(path.resolve('/app/client/dist'));
  });

  it('espeakPath returns ESPEAK_PATH or null', async () => {
    const { espeakPath } = await import('../config.js?tts=1');
    expect(espeakPath()).toBeNull();
    process.env.ESPEAK_PATH = '/x/espeak-ng';
    expect(espeakPath()).toBe('/x/espeak-ng');
  });

  it('whisperBinPath returns WHISPER_BIN or null', async () => {
    const { whisperBinPath } = await import('../config.js?case=whisper-bin');
    expect(whisperBinPath()).toBeNull();
    process.env.WHISPER_BIN = '/x/whisper-cli';
    expect(whisperBinPath()).toBe('/x/whisper-cli');
  });

  it('whisperModelPath returns WHISPER_MODEL or null', async () => {
    const { whisperModelPath } = await import('../config.js?case=whisper-model');
    expect(whisperModelPath()).toBeNull();
    process.env.WHISPER_MODEL = '/x/ggml-base-q5_1.bin';
    expect(whisperModelPath()).toBe('/x/ggml-base-q5_1.bin');
  });

  it('ipaModelDir returns IPA_MODEL_DIR or null', async () => {
    const { ipaModelDir } = await import('../config.js?case=ipa');
    expect(ipaModelDir()).toBeNull();
    process.env.IPA_MODEL_DIR = '/x/ipa-model';
    expect(ipaModelDir()).toBe('/x/ipa-model');
  });
});
