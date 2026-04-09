// Plaintext proctor password. Per spec section 9, defined here as a single
// constant so it lives in exactly one place.
export const PROCTOR_PASSWORD = 'JAD';

// Default values for a fresh proctor builder session.
// Mirrors spec section 9.2.
export const DEFAULT_FLASHCARD_BLOCK_COUNT = 2;
export const DEFAULT_FLASHCARD_BLOCK_DURATION_SEC = 60;
export const DEFAULT_SNAKE_ENABLED = true;
export const DEFAULT_SNAKE_DURATION_SEC = 60;
export const DEFAULT_ENABLED_MODES: readonly Mode[] = [1, 2, 3, 4];

// Hard limits.
export const FLASHCARD_BLOCK_COUNT_MIN = 1;
export const FLASHCARD_BLOCK_COUNT_MAX = 10;
export const FLASHCARD_BLOCK_DURATION_MIN_SEC = 10;
export const SNAKE_DURATION_MIN_SEC = 10;

// Help text under the mode checkboxes (spec section 9.8).
export const MODE_HELP_TEXT =
  '1 = phrase + text · 2 = phrase + audio · 3 = no-phrase + text · 4 = no-phrase + audio';
