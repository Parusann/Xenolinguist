import { ipcMain, shell, type BrowserWindow } from 'electron';
import { AtlasConnection, ATLAS_ORIGIN } from './atlas-connection.js';
import { trustedSender } from './security.js';

export function registerAtlasIpc(connection: AtlasConnection, window: () => BrowserWindow | null, origin: () => string) {
  const handle = (channel: string, action: (value: unknown) => unknown) => ipcMain.handle(channel, (event, value: unknown) => {
    if (!trustedSender(event, window(), origin())) throw new Error('Untrusted application sender');
    return action(value);
  });
  handle('atlas:status', () => connection.status());
  handle('atlas:connect', code => connection.connect(code));
  handle('atlas:request', request => connection.call(request));
  handle('atlas:disconnect', () => connection.disconnect());
  handle('atlas:open', () => shell.openExternal(ATLAS_ORIGIN + '/#/system'));
}
