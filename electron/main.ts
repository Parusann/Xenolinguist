import { app, BrowserWindow, utilityProcess, type UtilityProcess } from 'electron';
import path from 'path';
import { existsSync } from 'fs';
import { isOllamaUp, hasModel, pullDefaultModel } from './ollama.js';
import { autoUpdater } from 'electron-updater';

const isDev = !app.isPackaged;
const DEV_URL = 'http://localhost:5173';

let win: BrowserWindow | null = null;
let serverProc: UtilityProcess | null = null;

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

    serverProc = utilityProcess.fork(serverPath, [], {
      env: { ...process.env, PORT: '0', DATA_DIR: dataDir, CLIENT_DIST: clientDist, NODE_ENV: 'production', ...espeakEnv, ...whisperEnv },
      stdio: 'pipe',
    });
    serverProc.stdout?.on('data', (d) => console.log('[server]', d.toString().trim()));
    serverProc.stderr?.on('data', (d) => console.error('[server]', d.toString().trim()));

    serverProc.on('message', (msg: { type?: string; port?: number; message?: string }) => {
      if (msg?.type === 'server-ready' && msg.port) resolve(msg.port);
      else if (msg?.type === 'server-error') reject(new Error(msg.message));
    });
    serverProc.on('exit', (code) => { if (code !== 0) reject(new Error(`server exited ${code}`)); });
  });
}

async function createWindow() {
  win = new BrowserWindow({
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
    const port = await startServerProcess();
    await win.loadURL(`http://127.0.0.1:${port}`);
    autoUpdater.checkForUpdatesAndNotify().catch((e) => console.error('[update]', e));
  }

  void (async () => {
    if (!win) return;
    if (await isOllamaUp()) {
      if (!(await hasModel())) {
        try { await pullDefaultModel(win); } catch (e) { console.error('[ollama] pull failed', e); }
      }
    } else {
      win.webContents.send('ollama:offline', { url: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434' });
    }
  })();

  win.on('closed', () => { win = null; });
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
