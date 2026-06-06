import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('xeno', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
  },
});
