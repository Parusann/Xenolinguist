import { app, BrowserWindow, utilityProcess, ipcMain, dialog, type IpcMainInvokeEvent, type UtilityProcess } from 'electron';
import path from 'path';
import { existsSync } from 'fs';
import { isOllamaUp, hasModel, pullDefaultModel } from './ollama.js';
import { autoUpdater } from 'electron-updater';
import { testUserData } from './test-launch.js';
import { DesktopDraftStore } from './drafts.js';
import { DesktopAudioDrafts } from './audio-drafts.js';
import { randomUUID } from 'node:crypto';

const acceptanceUserData = testUserData();
if (acceptanceUserData) app.setPath('userData', acceptanceUserData);

const isDev = !app.isPackaged;
const DEV_URL = 'http://localhost:5173';

// Last-resort logging so a stray rejection/throw in the main process is recorded.
process.on('unhandledRejection', (reason) => console.error('[main] unhandledRejection', reason));
process.on('uncaughtException', (err) => console.error('[main] uncaughtException', err));

let win: BrowserWindow | null = null;
let serverProc: UtilityProcess | null = null;
let serverPort: number | null = null;
let closeAllowed = false;
let closeRequest: { id: string; resolve: (saved: boolean) => void } | null = null;
const drafts = new DesktopDraftStore(path.join(app.getPath('userData'), 'pending-saves'));
const audioDrafts = new DesktopAudioDrafts(path.join(app.getPath('userData'), 'pending-audio'));

function trustedRenderer(event: IpcMainInvokeEvent) {
  if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame)
    throw new Error('Untrusted draft request');
  const expected = isDev ? DEV_URL : `http://127.0.0.1:${serverPort}`;
  if (new URL(event.senderFrame.url).origin !== new URL(expected).origin) throw new Error('Untrusted draft origin');
}
ipcMain.handle('drafts:read', event => { trustedRenderer(event); return drafts.list(); });
ipcMain.handle('drafts:write', (event, record: unknown) => { trustedRenderer(event); return drafts.put(record); });
ipcMain.handle('audio-drafts:read', (event, id: unknown) => { trustedRenderer(event); return audioDrafts.read(id); });
ipcMain.handle('audio-drafts:write', (event, id: unknown, record) => { trustedRenderer(event); return audioDrafts.write(id, record); });
ipcMain.handle('audio-drafts:remove', (event, id: unknown) => { trustedRenderer(event); return audioDrafts.remove(id); });
ipcMain.handle('app:flush-result', (event, result: unknown) => {
  trustedRenderer(event);
  if (!result || typeof result !== 'object') throw new Error('Invalid flush result');
  const value = result as { requestId?: unknown; saved?: unknown };
  if (typeof value.requestId !== 'string' || typeof value.saved !== 'boolean' || value.requestId !== closeRequest?.id)
    throw new Error('Invalid flush result');
  closeRequest.resolve(value.saved);
});

/** In production, fork the bundled server and resolve once it reports its port. */
function startServerProcess(): Promise<number> {
  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, 'server.cjs');
    const clientDist = path.join(process.resourcesPath, 'client', 'dist');
    const dataDir = path.join(app.getPath('userData'), 'data');

    // Bundled espeak-ng (Windows only for now; elsewhere ESPEAK_PATH stays unset → browser TTS).
    const espeakBin = process.platform === 'win32'
      ? path.join(process.resourcesPath, 'espeak-ng', 'espeak-ng.exe')
      : path.join(process.resourcesPath, 'espeak-ng', 'espeak-ng');
    const espeakEnv = existsSync(espeakBin) ? { ESPEAK_PATH: espeakBin } : {};

    // Bundled whisper.cpp (Windows only for now; elsewhere WHISPER_* stays unset → STT disabled).
    const whisperBin = process.platform === 'win32'
      ? path.join(process.resourcesPath, 'whisper', 'whisper-cli.exe')
      : path.join(process.resourcesPath, 'whisper', 'whisper-cli');
    const whisperModel = path.join(process.resourcesPath, 'whisper', 'ggml-base-q5_1.bin');
    const whisperEnv = (existsSync(whisperBin) && existsSync(whisperModel))
      ? { WHISPER_BIN: whisperBin, WHISPER_MODEL: whisperModel }
      : {};

    const ipaModel = path.join(process.resourcesPath, 'ipa-model');
    const ipaEnv = { IPA_MODEL_DIR: ipaModel };

    // Resolve the supported Node export from the staged production dependency closure.
    const ipaDepsEnv = { XENO_RUNTIME_ROOT: path.join(process.resourcesPath, 'server-deps') };

    serverProc = utilityProcess.fork(serverPath, [], {
      env: { ...process.env, PORT: '0', DATA_DIR: dataDir, CLIENT_DIST: clientDist, NODE_ENV: 'production', ...espeakEnv, ...whisperEnv, ...ipaEnv, ...ipaDepsEnv },
      stdio: 'pipe',
    });
    serverProc.stdout?.on('data', (d) => console.log('[server]', d.toString().trim()));
    serverProc.stderr?.on('data', (d) => console.error('[server]', d.toString().trim()));

    // Guarantee this promise always settles: a hung server (never posts ready/error,
    // never exits) would otherwise leave createWindow awaiting forever → blank window.
    let settled = false;
    const settle = (fn: (v: unknown) => void, arg: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(arg);
    };
    const timer = setTimeout(
      () => settle(reject as (v: unknown) => void, new Error('server startup timed out after 30s')),
      30_000,
    );

    serverProc.on('message', (msg: { type?: string; port?: number; message?: string }) => {
      if (msg?.type === 'server-ready' && msg.port) settle(resolve as (v: unknown) => void, msg.port);
      else if (msg?.type === 'server-error') settle(reject as (v: unknown) => void, new Error(msg.message));
    });
    // Any exit before 'server-ready' is a failure, even code 0 (clean exit pre-ready).
    serverProc.on('exit', (code) =>
      settle(reject as (v: unknown) => void, new Error(`server exited (${code ?? 'unknown'}) before ready`)),
    );
  });
}

async function createWindow() {
  closeAllowed = false;
  win = new BrowserWindow({
    show: !acceptanceUserData,
    width: 1280,
    height: 860,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    await win.loadURL(DEV_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    try {
      // Reuse the already-forked server on macOS re-activate instead of forking a second one.
      const port = serverPort ?? await startServerProcess();
      serverPort = port;
      await win.loadURL(`http://127.0.0.1:${port}`);
      if (!acceptanceUserData) autoUpdater.checkForUpdatesAndNotify().catch((e) => console.error('[update]', e));
    } catch (err) {
      // Surface startup failure instead of leaving the window blank forever.
      console.error('[server] failed to start:', err);
      await win.loadURL(
        'data:text/html,' +
          encodeURIComponent(
            '<body style="background:#0a0a0a;color:#e0e0e0;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">' +
              '<div><h2 style="font-weight:400">Xenolinguist failed to start</h2>' +
              '<p style="color:#888">The local server did not start. Please restart the app.</p></div></body>',
          ),
      );
    }
  }

  void (async () => {
    if (!win || acceptanceUserData) return;
    if (await isOllamaUp()) {
      if (!(await hasModel())) {
        try { await pullDefaultModel(win); } catch (e) { console.error('[ollama] pull failed', e); }
      }
    } else {
      win.webContents.send('ollama:offline', { url: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434' });
    }
  })();

  win.on('closed', () => { win = null; });
  win.on('close', event => {
    if (closeAllowed) return;
    if (win?.webContents.getURL().startsWith('data:')) return; // Startup error page has no editable workspace.
    event.preventDefault();
    if (closeRequest) return;
    void (async () => {
      const currentWindow = win;
      if (!currentWindow) return;
      const saved = await new Promise<boolean>(resolve => {
        const id = randomUUID();
        const timer = setTimeout(() => resolve(false), 20_000);
        closeRequest = { id, resolve: value => { clearTimeout(timer); resolve(value); } };
        currentWindow.webContents.send('app:flush-request', { requestId: id });
      });
      let close = saved;
      if (!saved) {
        const choice = await dialog.showMessageBox(currentWindow, { type: 'warning', title: 'Unsaved changes',
          message: 'Some changes could not be saved. Keep the window open to retry, or close and recover any stored drafts next time.',
          buttons: ['Keep open', 'Close anyway'], defaultId: 0, cancelId: 0, noLink: true });
        close = choice.response === 1;
      }
      closeRequest = null;
      if (close) { closeAllowed = true; currentWindow.close(); }
      else currentWindow.webContents.send('app:close-cancelled');
    })().catch(error => { closeRequest = null; console.error('[close]', error); win?.webContents.send('app:close-cancelled'); });
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(createWindow);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('quit', () => { serverProc?.kill(); });
}
