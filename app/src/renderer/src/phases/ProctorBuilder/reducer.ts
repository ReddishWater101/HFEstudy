import {
  DEFAULT_ENABLED_MODES,
  DEFAULT_FLASHCARD_BLOCK_COUNT,
  DEFAULT_FLASHCARD_BLOCK_DURATION_SEC,
  DEFAULT_SNAKE_DURATION_SEC,
  DEFAULT_SNAKE_ENABLED,
  FLASHCARD_BLOCK_COUNT_MAX,
  FLASHCARD_BLOCK_COUNT_MIN,
  FLASHCARD_BLOCK_DURATION_MIN_SEC,
  SNAKE_DURATION_MIN_SEC,
} from './constants';

export type BuilderState = {
  selectedUuids: Set<string>;
  flashcardBlockCount: number;
  flashcardBlockDurationSec: number;
  snakeEnabled: boolean;
  snakeDurationSec: number;
  enabledModes: Set<Mode>;
  previewingUuid: string | null;
  error: string | null;
};

export const initialBuilderState: BuilderState = {
  selectedUuids: new Set(),
  flashcardBlockCount: DEFAULT_FLASHCARD_BLOCK_COUNT,
  flashcardBlockDurationSec: DEFAULT_FLASHCARD_BLOCK_DURATION_SEC,
  snakeEnabled: DEFAULT_SNAKE_ENABLED,
  snakeDurationSec: DEFAULT_SNAKE_DURATION_SEC,
  enabledModes: new Set(DEFAULT_ENABLED_MODES),
  previewingUuid: null,
  error: null,
};

export type BuilderAction =
  | { type: 'togglePerson'; uuid: string }
  | { type: 'selectAll'; uuids: string[] }
  | { type: 'deselectAll' }
  | { type: 'setBlockCount'; value: number }
  | { type: 'setBlockDuration'; value: number }
  | { type: 'setSnakeEnabled'; value: boolean }
  | { type: 'setSnakeDuration'; value: number }
  | { type: 'toggleMode'; mode: Mode }
  | { type: 'openPreview'; uuid: string }
  | { type: 'closePreview' }
  | { type: 'setError'; message: string | null }
  | { type: 'loadFromConfig'; config: StudyConfig };

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function clampMin(value: number, min: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(value, min);
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case 'togglePerson': {
      const next = new Set(state.selectedUuids);
      if (next.has(action.uuid)) {
        next.delete(action.uuid);
      } else {
        next.add(action.uuid);
      }
      return { ...state, selectedUuids: next, error: null };
    }
    case 'selectAll':
      return { ...state, selectedUuids: new Set(action.uuids), error: null };
    case 'deselectAll':
      return { ...state, selectedUuids: new Set(), error: null };
    case 'setBlockCount':
      return {
        ...state,
        flashcardBlockCount: clamp(
          Math.floor(action.value),
          FLASHCARD_BLOCK_COUNT_MIN,
          FLASHCARD_BLOCK_COUNT_MAX,
        ),
        error: null,
      };
    case 'setBlockDuration':
      return {
        ...state,
        flashcardBlockDurationSec: clampMin(
          Math.floor(action.value),
          FLASHCARD_BLOCK_DURATION_MIN_SEC,
        ),
        error: null,
      };
    case 'setSnakeEnabled':
      return { ...state, snakeEnabled: action.value, error: null };
    case 'setSnakeDuration':
      return {
        ...state,
        snakeDurationSec: clampMin(Math.floor(action.value), SNAKE_DURATION_MIN_SEC),
        error: null,
      };
    case 'toggleMode': {
      const next = new Set(state.enabledModes);
      if (next.has(action.mode)) {
        // Refuse to remove the last mode (spec acceptance criterion).
        if (next.size <= 1) return state;
        next.delete(action.mode);
      } else {
        next.add(action.mode);
      }
      return { ...state, enabledModes: next, error: null };
    }
    case 'openPreview':
      return { ...state, previewingUuid: action.uuid };
    case 'closePreview':
      return { ...state, previewingUuid: null };
    case 'setError':
      return { ...state, error: action.message };
    case 'loadFromConfig':
      return {
        ...state,
        selectedUuids: new Set(action.config.people),
        flashcardBlockCount: action.config.flashcardBlockCount,
        flashcardBlockDurationSec: action.config.flashcardBlockDurationSec,
        snakeEnabled: action.config.snakeEnabled,
        snakeDurationSec: action.config.snakeDurationSec,
        enabledModes: new Set(action.config.enabledModes),
        previewingUuid: null,
        error: null,
      };
  }
}
