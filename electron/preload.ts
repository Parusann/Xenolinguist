import { contextBridge, ipcRenderer } from 'electron';

// Named subscriptions and narrow validated operations; raw IPC is never exposed.
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
  readSaveQueue: () => ipcRenderer.invoke('drafts:read'),
  writeSaveQueue: (record: unknown) => ipcRenderer.invoke('drafts:write', record),
  onFlushRequest: subscribe('app:flush-request'),
  onCloseCancelled: subscribe('app:close-cancelled'),
  reportFlushResult: (result: { requestId: string; saved: boolean }) => ipcRenderer.invoke('app:flush-result', result),
});
