import { expect, it, vi } from 'vitest';
vi.mock('electron', () => ({ shell: { openExternal: vi.fn(async () => {}) } }));
import { allowedExternal, sameOrigin, secureWindow, trustedSender } from '../../../electron/security.js';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';

it('validates origins and external URLs without prefix matching', () => {
  expect(sameOrigin('http://127.0.0.1:3001/app', 'http://127.0.0.1:3001')).toBe(true);
  for (const url of ['http://127.0.0.1:3002', 'http://127.0.0.1.evil:3001', 'data:text/html,x', 'not a URL']) expect(sameOrigin(url, 'http://127.0.0.1:3001')).toBe(false);
  expect(allowedExternal('https://github.com/Parusann/Xenolinguist')).toBe(true);
  for (const url of ['file:///C:/Windows', 'https://github.com.evil/Parusann', 'https://user@github.com/Parusann', 'https://github.com/ParusannEvil', 'https://evil.example']) expect(allowedExternal(url)).toBe(false);
});
it('restricts IPC, credential injection, navigation and permissions to the trusted frame', () => {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const contents = { id: 1, mainFrame: { url: 'http://127.0.0.1:3001/app' }, getURL: () => 'http://127.0.0.1:3001/app',
    on: (name: string, fn: (...args: any[]) => any) => { handlers[name] = fn; }, setWindowOpenHandler: (fn: any) => { handlers.open = fn; },
    session: { webRequest: { onBeforeSendHeaders: (fn: any) => { handlers.headers = fn; } }, setPermissionCheckHandler: (fn: any) => { handlers.check = fn; }, setPermissionRequestHandler: (fn: any) => { handlers.permission = fn; } } };
  const win = { webContents: contents } as unknown as BrowserWindow;
  const origin = 'http://127.0.0.1:3001', secret = 'a'.repeat(64);
  secureWindow(win, origin, secret);
  const event = { sender: contents, senderFrame: contents.mainFrame } as unknown as IpcMainInvokeEvent;
  expect(trustedSender(event, win, origin)).toBe(true);
  expect(trustedSender({ ...event, senderFrame: { url: contents.mainFrame.url } } as IpcMainInvokeEvent, win, origin)).toBe(false);
  const details = { requestHeaders: { 'x-xeno-session': 'forged' }, webContentsId: 1, frame: contents.mainFrame, url: origin + '/api/audio/clip' };
  for (const patch of [{}, { webContentsId: 2 }, { frame: null }, { frame: { url: contents.mainFrame.url } }, { url: 'https://evil.example/api/profiles' }]) {
    const result = vi.fn(); handlers.headers({ ...details, ...patch }, result);
    expect(Object.values(result.mock.calls[0][0].requestHeaders).includes(secret)).toBe(Object.keys(patch).length === 0);
    expect(Object.values(result.mock.calls[0][0].requestHeaders)).not.toContain('forged');
  }
  const navigation = { preventDefault: vi.fn() }; handlers['will-navigate'](navigation, 'file:///tmp/evil'); expect(navigation.preventDefault).toHaveBeenCalled();
  expect(handlers.open({ url: 'https://evil.example' })).toEqual({ action: 'deny' });
  expect(handlers.check(contents, 'media', origin, { mediaType: 'audio', isMainFrame: true })).toBe(true);
  expect(handlers.check(contents, 'media', origin, { mediaType: 'video', isMainFrame: true })).toBe(false);
  expect(handlers.check(contents, 'media', origin, { mediaType: 'audio', isMainFrame: false })).toBe(false);
  expect(handlers.check(contents, 'geolocation', origin, { isMainFrame: true })).toBe(false);
  const permission = { requestingUrl: origin + '/app', mediaTypes: ['audio'], isMainFrame: true };
  for (const patch of [{}, { mediaTypes: ['video'] }, { isMainFrame: false }, { requestingUrl: 'https://evil.example' }]) {
    const result = vi.fn(); handlers.permission(contents, 'media', result, { ...permission, ...patch });
    expect(result).toHaveBeenCalledWith(Object.keys(patch).length === 0);
  }
  const result = vi.fn(); handlers.permission(null, 'media', result, permission); expect(result).toHaveBeenCalledWith(false);
});
