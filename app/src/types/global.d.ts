declare global {
  type Person = {
    id: string;
    firstName: string;
    imageUrl: string;
    videoUrl: string;
    audioUrl: string;
  };

  type PersonWithUuid = Person & { uuid: string };

  type AppConfig = {
    recallTimePerFaceSec: number;
    phraseMinChars: number;
    fuzzyMatchMaxEdits: number;
    mandatorySecondVideoPlay: boolean;
    assetsPath: string;
    exportPath: string;
  };

  type Mode = 1 | 2 | 3 | 4;

  type StudyConfig = {
    version: 1;
    id: string;
    createdAt: string;
    people: string[];
    flashcardBlockCount: number;
    flashcardBlockDurationSec: number;
    snakeEnabled: boolean;
    snakeDurationSec: number;
    enabledModes: Mode[];
  };

  type ResolvedStudyConfig = StudyConfig & {
    resolvedPeople: Person[];
  };

  type UuidRegistry = {
    version: 1;
    entries: Record<string, string>;
  };

  type IntakeData = { firstName: string; lastName: string; email: string };

  type SessionEvent =
    | {
        type: 'session.start';
        t: number;
        participantId: string;
        intake: IntakeData;
        modeAssignment: Record<string, Mode>;
        people: { id: string; firstName: string }[];
        studyConfigId: string;
        blockCount: number;
        enabledModes: Mode[];
      }
    | { type: 'intro.video.play'; t: number; personId: string; playCount: number }
    | { type: 'intro.video.error'; t: number; personId: string }
    | { type: 'intro.video.stall'; t: number; personId: string }
    | { type: 'intro.phrase.input'; t: number; personId: string; phrase: string }
    | { type: 'intro.advance'; t: number; personId: string }
    | {
        type: 'flashcard.show';
        t: number;
        personId: string;
        mode: Mode;
        blockLabel: string;
      }
    | {
        type: 'flashcard.bucket';
        t: number;
        personId: string;
        bucket: 'still-learning' | 'know-it';
        durationMs: number;
      }
    | { type: 'flashcard.refill'; t: number; blockLabel: string }
    | { type: 'snake.start'; t: number; afterBlockIndex: number }
    | { type: 'snake.gameover'; t: number; score: number }
    | { type: 'snake.end'; t: number; afterBlockIndex: number }
    | { type: 'quiz.show'; t: number; personId: string; trueName: string }
    | {
        type: 'quiz.answer';
        t: number;
        personId: string;
        typed: string;
        correct: boolean;
        editDistance: number;
        rtMs: number;
      }
    | { type: 'quiz.idk'; t: number; personId: string; rtMs: number }
    | { type: 'quiz.timeout'; t: number; personId: string }
    | { type: 'session.finalize'; t: number };

  type Api = {
    getConfig: () => Promise<AppConfig>;
    getPeopleWithUuids: () => Promise<PersonWithUuid[]>;
    getRegistry: () => Promise<UuidRegistry>;
    readStudyFile: (filePath: string) => Promise<{
      config: StudyConfig;
      resolvedPeople: Person[];
    }>;
    writeStudyFile: (filePath: string, config: StudyConfig) => Promise<void>;
    showStudyFileOpenDialog: () => Promise<{
      filePath: string;
      config: StudyConfig;
      resolvedPeople: Person[];
    } | null>;
    showStudyFileSaveDialog: (
      config: StudyConfig,
    ) => Promise<{ filePath: string } | null>;
    startSession: (intake: IntakeData) => Promise<{ participantId: string; sessionDir: string }>;
    logEvent: (event: SessionEvent) => Promise<void>;
    finalizeSession: () => Promise<{ exportDir: string }>;
    copySessionTo: (destDir: string) => Promise<void>;
    showExportDialog: () => Promise<string | null>;
    downloadSessionZip: () => Promise<{ zipPath: string }>;
    quit: () => Promise<void>;
  };

  interface Window {
    api: Api;
  }
}

export {};
