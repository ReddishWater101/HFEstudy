import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { readFile } from 'node:fs/promises';
import { closeSync, fsyncSync, openSync, renameSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { scanPeople } from './assets';
import { getCurrentConfig } from './config';
import { attachUuids, getCurrentRegistry } from './peopleRegistry';
import {
  StudyConfigZ,
  flattenZodError,
  resolvePeopleOrThrow,
  type StudyConfig,
} from './studyConfig';
import {
  appendEvent,
  copySessionTo,
  downloadSessionZip,
  finalizeSession,
  startSession,
  type Intake,
  type SessionEvent,
} from './session-writer';

/**
 * Write data to a temp file, fsync it, then rename over the target.
 * Prevents crash-mid-write from destroying the destination file.
 */
function writeFileAtomic(filePath: string, data: string): void {
  const tmp = `${filePath}.${Date.now()}.${randomBytes(4).toString('hex')}.tmp`;
  const fd = openSync(tmp, 'w');
  try {
    writeFileSync(fd, data, 'utf8');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, filePath);
}

function toErrorMessage(err: unknown): string {
  if (err instanceof z.ZodError) return flattenZodError(err);
  if (err instanceof Error) return err.message;
  return String(err);
}

async function readAndValidateStudyFile(filePath: string): Promise<{
  config: StudyConfig;
  resolvedPeople: Awaited<ReturnType<typeof scanPeople>>;
}> {
  const raw = await readFile(filePath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  const cfg = StudyConfigZ.parse(parsed);
  const registry = getCurrentRegistry();
  const allPeople = await scanPeople();
  const resolvedPeople = await resolvePeopleOrThrow(cfg, registry, allPeople);
  return { config: cfg, resolvedPeople };
}

/**
 * Build a personMap (UUID -> firstName) for the given study config
 * by looking up each UUID in the current registry. This is embedded
 * in saved study files so they are portable across machines.
 */
function buildPersonMap(cfg: StudyConfig): Record<string, string> {
  const registry = getCurrentRegistry();
  const uuidToName: Record<string, string> = {};
  for (const [firstName, uuid] of Object.entries(registry.entries)) {
    uuidToName[uuid] = firstName;
  }
  const personMap: Record<string, string> = {};
  for (const uuid of cfg.people) {
    if (uuidToName[uuid]) {
      personMap[uuid] = uuidToName[uuid];
    }
  }
  return personMap;
}

export function registerIpc(): void {
  ipcMain.handle('getConfig', () => {
    return getCurrentConfig();
  });

  ipcMain.handle('getPeopleWithUuids', async () => {
    const scanned = await scanPeople();
    return attachUuids(scanned);
  });

  ipcMain.handle('getRegistry', () => {
    return getCurrentRegistry();
  });

  ipcMain.handle('readStudyFile', async (_event, filePath: string) => {
    try {
      return await readAndValidateStudyFile(filePath);
    } catch (err) {
      throw new Error(toErrorMessage(err));
    }
  });

  ipcMain.handle(
    'writeStudyFile',
    async (_event, filePath: string, config: StudyConfig) => {
      try {
        StudyConfigZ.parse(config);
      } catch (err) {
        throw new Error(toErrorMessage(err));
      }
      const withMap = { ...config, personMap: buildPersonMap(config) };
      writeFileAtomic(filePath, JSON.stringify(withMap, null, 2));
    },
  );

  ipcMain.handle('showStudyFileOpenDialog', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = window
      ? await dialog.showOpenDialog(window, {
          properties: ['openFile'],
          filters: [
            { name: 'HFE Study File', extensions: ['hfestudy.json', 'json'] },
          ],
        })
      : await dialog.showOpenDialog({
          properties: ['openFile'],
          filters: [
            { name: 'HFE Study File', extensions: ['hfestudy.json', 'json'] },
          ],
        });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    try {
      const { config, resolvedPeople } = await readAndValidateStudyFile(filePath);
      return { filePath, config, resolvedPeople };
    } catch (err) {
      throw new Error(toErrorMessage(err));
    }
  });

  ipcMain.handle('showStudyFileSaveDialog', async (event, cfg: StudyConfig) => {
    try {
      StudyConfigZ.parse(cfg);
    } catch (err) {
      throw new Error(toErrorMessage(err));
    }
    const window = BrowserWindow.fromWebContents(event.sender);
    const dialogOptions = {
      defaultPath: `study-${Date.now()}.hfestudy.json`,
      filters: [{ name: 'HFE Study File', extensions: ['hfestudy.json'] }],
    };
    const result = window
      ? await dialog.showSaveDialog(window, dialogOptions)
      : await dialog.showSaveDialog(dialogOptions);
    if (result.canceled || !result.filePath) return null;
    let filePath = result.filePath;
    if (!filePath.endsWith('.hfestudy.json')) {
      filePath = filePath.replace(/\.json$/i, '') + '.hfestudy.json';
    }
    const withMap = { ...cfg, personMap: buildPersonMap(cfg) };
    writeFileAtomic(filePath, JSON.stringify(withMap, null, 2));
    return { filePath };
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
  ipcMain.handle('downloadSessionZip', () => {
    return downloadSessionZip();
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
