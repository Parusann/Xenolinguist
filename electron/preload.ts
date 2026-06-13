import { contextBridge, ipcRenderer } from 'electron';

// Receive-only subscription to a single named main→renderer channel. Returns an unsubscribe.
// This keeps the bridge minimal: no ipcRenderer.invoke/send is exposed to the renderer.
const subscribe = (channel: string) => (cb: (data: unknown) => void) => {
  const handler = (_e: unknown, data: unknown) => cb(data);
  ipcRenderer.on(channel, handler as never);
  return () => { ipcRenderer.off(channel, handler as never); };
};

contextBridge.exposeInMainWorld('xeno', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
  },
  onOllamaOffline: subscribe('ollama:offline'),
  onOllamaPullProgress: subscribe('ollama:pull-progress'),
});
