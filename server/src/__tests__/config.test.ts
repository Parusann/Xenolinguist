import { describe, it, expect, afterEach } from 'vitest';
import path from 'path';

afterEach(() => {
  delete process.env.DATA_DIR;
  delete process.env.OLLAMA_MODEL;
  delete process.env.CLIENT_DIST;
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
});
