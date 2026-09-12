import { shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';

export function sameOrigin(value: string, expected: string) {
  try { const url = new URL(value); return !url.username && !url.password && url.origin === new URL(expected).origin; } catch { return false; }
}
export function allowedExternal(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && (url.hostname === 'ollama.com' || (url.hostname === 'github.com' && /^\/Parusann(?:\/|$)/.test(url.pathname)));
  } catch { return false; }
}
export function trustedSender(event: IpcMainInvokeEvent, win: BrowserWindow | null, origin: string) {
  return !!win && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame
    && sameOrigin(event.senderFrame.url, origin);
}
export function secureWindow(win: BrowserWindow, origin: string, secret?: string) {
  const contents = win.webContents, session = contents.session;
  session.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    for (const key of Object.keys(headers)) if (key.toLowerCase() === 'x-xeno-session') delete headers[key];
    const trusted = details.webContentsId === contents.id && details.frame === contents.mainFrame
      && sameOrigin(details.frame.url, origin);
    if (secret && trusted && sameOrigin(details.url, origin) && new URL(details.url).pathname.startsWith('/api/')) headers['X-Xeno-Session'] = secret;
    callback({ requestHeaders: headers });
  });
  const external = (url: string) => {
    if (sameOrigin(contents.getURL(), origin) && allowedExternal(url)) void shell.openExternal(url).catch(() => {});
  };
  contents.on('will-navigate', (event, url) => { if (!sameOrigin(url, origin)) { event.preventDefault(); external(url); } });
  contents.on('will-redirect', (event, url) => { if (!sameOrigin(url, origin)) event.preventDefault(); });
  contents.on('will-frame-navigate', (event) => { if (!event.isMainFrame || !sameOrigin(event.url, origin)) event.preventDefault(); });
  contents.setWindowOpenHandler(({ url }) => { external(url); return { action: 'deny' }; });
  contents.on('will-attach-webview', event => event.preventDefault());
  session.setPermissionCheckHandler((sender, permission, requestingOrigin, details) =>
    sender === contents && permission === 'media' && details.mediaType === 'audio' && details.isMainFrame
      && sameOrigin(requestingOrigin, origin) && sameOrigin(contents.getURL(), origin));
  session.setPermissionRequestHandler((sender, permission, callback, details) => callback(
    sender === contents && permission === 'media' && details.isMainFrame && sameOrigin(details.requestingUrl, origin)
      && sameOrigin(contents.getURL(), origin) && 'mediaTypes' in details && details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'audio'));
}
