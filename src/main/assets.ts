import { app } from 'electron';
import { readdir, stat } from 'node:fs/promises';
import { join, parse } from 'node:path';

export type Person = {
  id: string;
  firstName: string;
  imageUrl: string;
  videoUrl: string;
  audioUrl: string;
};

export function getAssetsRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'People');
  }
  return join(app.getAppPath(), 'People');
}

async function listStemsByExt(dir: string, ext: string): Promise<Set<string>> {
  const entries = await readdir(dir);
  const stems = new Set<string>();
  for (const entry of entries) {
    const parsed = parse(entry);
    if (parsed.ext.toLowerCase() === ext) {
      stems.add(parsed.name);
    }
  }
  return stems;
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}

export async function scanPeople(): Promise<Person[]> {
  const root = getAssetsRoot();
  const pfpDir = join(root, 'PFP');
  const videoDir = join(root, 'videos');
  const audioDir = join(root, 'audio');

  if (
    !(await dirExists(pfpDir)) ||
    !(await dirExists(videoDir)) ||
    !(await dirExists(audioDir))
  ) {
    return [];
  }

  const [pfpStems, videoStems, audioStems] = await Promise.all([
    listStemsByExt(pfpDir, '.png'),
    listStemsByExt(videoDir, '.mp4'),
    listStemsByExt(audioDir, '.m4a'),
  ]);

  const paired: Person[] = [];
  for (const name of pfpStems) {
    if (!videoStems.has(name) || !audioStems.has(name)) continue;
    paired.push({
      id: name.toLowerCase(),
      firstName: name,
      imageUrl: `app://people/PFP/${name}.png`,
      videoUrl: `app://people/videos/${name}.mp4`,
      audioUrl: `app://people/audio/${name}.m4a`,
    });
  }

  paired.sort((a, b) => a.firstName.localeCompare(b.firstName));
  return paired;
}
