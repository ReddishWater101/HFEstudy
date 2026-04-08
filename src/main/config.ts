import { app } from 'electron';
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';

export const AppConfigSchema = z.object({
  numberOfPeople: z.number().int().positive(),
  numFlashcardSessions: z.number().int().positive(),
  flashcardSessionDurationSec: z.number().positive(),
  snakeDurationSec: z.number().positive(),
  recallTimePerFaceSec: z.number().positive(),
  phraseMinChars: z.number().int().nonnegative(),
  fuzzyMatchMaxEdits: z.number().int().nonnegative(),
  mandatorySecondVideoPlay: z.boolean(),
  assetsPath: z.string().min(1),
  exportPath: z.string().min(1),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

export function getConfigPath(): string {
  return join(app.getPath('userData'), 'config.json');
}

function getDefaultConfigPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'config.default.json');
  }
  return join(app.getAppPath(), 'resources', 'config.default.json');
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

let cachedConfig: AppConfig | null = null;

export async function loadConfig(): Promise<AppConfig> {
  const configPath = getConfigPath();

  if (!(await fileExists(configPath))) {
    await mkdir(dirname(configPath), { recursive: true });
    await copyFile(getDefaultConfigPath(), configPath);
  }

  const raw = await readFile(configPath, 'utf8');
  const parsed = JSON.parse(raw);
  const validated = AppConfigSchema.parse(parsed);
  cachedConfig = validated;
  return validated;
}

export function getCurrentConfig(): AppConfig {
  if (!cachedConfig) {
    throw new Error('Config not loaded — call loadConfig() first');
  }
  return cachedConfig;
}
