import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { scanPeople } from './assets';
import { getCurrentConfig } from './config';
import {
  appendEvent,
  copySessionTo,
  finalizeSession,
  startSession,
  type Intake,
  type SessionEvent,
} from './session-writer';

export function registerIpc(): void {
  ipcMain.handle('getPeople', async () => {
    return scanPeople();
  });
  ipcMain.handle('getConfig', () => {
    return getCurrentConfig();
  });
  ipcMain.handle('startSession', (_event, intake: Intake) => {
    return startSession(intake);
  });
  ipcMain.handle('logEvent', (_event, sessionEvent: SessionEvent) => {
    appendEvent(sessionEvent);
  });
  ipcMain.handle('finalizeSession', () => {
    return finalizeSession();
  });
  ipcMain.handle('copySessionTo', (_event, destDir: string) => {
    copySessionTo(destDir);
  });
  ipcMain.handle('showExportDialog', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = window
      ? await dialog.showOpenDialog(window, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
  ipcMain.handle('quit', () => {
    app.quit();
  });
}
