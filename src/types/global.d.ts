declare global {
  type Person = {
    id: string;
    firstName: string;
    imageUrl: string;
    videoUrl: string;
    audioUrl: string;
  };

  type AppConfig = {
    numberOfPeople: number;
    flashcardSessionDurationSec: number;
    snakeDurationSec: number;
    recallTimePerFaceSec: number;
    phraseMinChars: number;
    fuzzyMatchMaxEdits: number;
    mandatorySecondVideoPlay: boolean;
    assetsPath: string;
    exportPath: string;
  };

  type Mode = 1 | 2 | 3 | 4;

  type IntakeData = { firstName: string; lastName: string; email: string };

  type SessionEvent =
    | {
        type: 'session.start';
        t: number;
        participantId: string;
        intake: IntakeData;
        modeAssignment: Record<string, Mode>;
        people: { id: string; firstName: string }[];
      }
    | { type: 'intro.video.play'; t: number; personId: string; playCount: number }
    | { type: 'intro.phrase.input'; t: number; personId: string; phrase: string }
    | { type: 'intro.advance'; t: number; personId: string }
    | {
        type: 'flashcard.show';
        t: number;
        personId: string;
        mode: Mode;
        sessionLabel: 'A' | 'B';
      }
    | {
        type: 'flashcard.bucket';
        t: number;
        personId: string;
        bucket: 'still-learning' | 'know-it';
        durationMs: number;
      }
    | { type: 'flashcard.refill'; t: number; sessionLabel: 'A' | 'B' }
    | { type: 'snake.start'; t: number }
    | { type: 'snake.gameover'; t: number; score: number }
    | { type: 'snake.end'; t: number }
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
    | { type: 'quiz.timeout'; t: number; personId: string }
    | { type: 'session.finalize'; t: number };

  type Api = {
    getPeople: () => Promise<Person[]>;
    getConfig: () => Promise<AppConfig>;
    startSession: (intake: IntakeData) => Promise<{ participantId: string; sessionDir: string }>;
    logEvent: (event: SessionEvent) => Promise<void>;
    finalizeSession: () => Promise<{ exportDir: string }>;
    copySessionTo: (destDir: string) => Promise<void>;
    showExportDialog: () => Promise<string | null>;
    quit: () => Promise<void>;
  };

  interface Window {
    api: Api;
  }
}

export {};
