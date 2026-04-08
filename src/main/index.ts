import { app, BrowserWindow, dialog, session, shell } from 'electron';
import { join } from 'node:path';
import { loadConfig } from './config';
import { registerAppProtocolHandler, registerSchemes } from './protocol';
import { registerIpc } from './ipc';

const isDev = !app.isPackaged;

registerSchemes();

const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: app:",
  "media-src 'self' app:",
  "font-src 'self' data:",
  "connect-src 'self' app:",
].join('; ');

const DEV_CSP = [
  "default-src 'self' http://localhost:5173 ws://localhost:5173",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173",
  "style-src 'self' 'unsafe-inline' http://localhost:5173",
  "img-src 'self' data: app: http://localhost:5173",
  "media-src 'self' app:",
  "font-src 'self' data: http://localhost:5173",
  "connect-src 'self' app: http://localhost:5173 ws://localhost:5173",
].join('; ');

const CSP = isDev ? DEV_CSP : PROD_CSP;

function applyCspHeaders(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP],
      },
    });
  });
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: 'HFE Study',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  window.on('ready-to-show', () => {
    window.show();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return window;
}

app.whenReady().then(async () => {
  try {
    await loadConfig();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    dialog.showErrorBox(
      'Config error',
      `Failed to load config.json:\n\n${message}\n\nThe app will now quit.`,
    );
    app.quit();
    return;
  }

  applyCspHeaders();
  registerAppProtocolHandler();
  registerIpc();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
