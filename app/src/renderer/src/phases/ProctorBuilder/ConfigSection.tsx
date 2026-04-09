import { Input } from '../../components/ui/Input';
import { Label } from '../../components/ui/Label';
import { cn } from '../../lib/cn';
import {
  FLASHCARD_BLOCK_COUNT_MAX,
  FLASHCARD_BLOCK_COUNT_MIN,
  FLASHCARD_BLOCK_DURATION_MIN_SEC,
  MODE_HELP_TEXT,
  SNAKE_DURATION_MIN_SEC,
} from './constants';

type Props = {
  flashcardBlockCount: number;
  flashcardBlockDurationSec: number;
  snakeEnabled: boolean;
  snakeDurationSec: number;
  enabledModes: Set<Mode>;
  onBlockCount: (value: number) => void;
  onBlockDuration: (value: number) => void;
  onSnakeEnabled: (value: boolean) => void;
  onSnakeDuration: (value: number) => void;
  onToggleMode: (mode: Mode) => void;
};

const ALL_MODES: Mode[] = [1, 2, 3, 4];

export function ConfigSection({
  flashcardBlockCount,
  flashcardBlockDurationSec,
  snakeEnabled,
  snakeDurationSec,
  enabledModes,
  onBlockCount,
  onBlockDuration,
  onSnakeEnabled,
  onSnakeDuration,
  onToggleMode,
}: Props) {
  return (
    <section className="grid grid-cols-1 gap-x-12 gap-y-10 md:grid-cols-2">
      <NumberField
        id="block-count"
        label="Flashcard blocks"
        hint={`Integer ${FLASHCARD_BLOCK_COUNT_MIN}–${FLASHCARD_BLOCK_COUNT_MAX}`}
        value={flashcardBlockCount}
        min={FLASHCARD_BLOCK_COUNT_MIN}
        max={FLASHCARD_BLOCK_COUNT_MAX}
        step={1}
        onChange={onBlockCount}
      />

      <NumberField
        id="block-duration"
        label="Block duration (seconds)"
        hint={`Integer · minimum ${FLASHCARD_BLOCK_DURATION_MIN_SEC}`}
        value={flashcardBlockDurationSec}
        min={FLASHCARD_BLOCK_DURATION_MIN_SEC}
        step={1}
        onChange={onBlockDuration}
      />

      <ToggleField
        id="snake-enabled"
        label="Snake interlude"
        hint="Plays after every flashcard block."
        checked={snakeEnabled}
        onChange={onSnakeEnabled}
      />

      <NumberField
        id="snake-duration"
        label="Snake duration (seconds)"
        hint={`Integer · minimum ${SNAKE_DURATION_MIN_SEC}`}
        value={snakeDurationSec}
        min={SNAKE_DURATION_MIN_SEC}
        step={1}
        onChange={onSnakeDuration}
        disabled={!snakeEnabled}
      />

      <div className="flex flex-col gap-3 md:col-span-2">
        <Label>Enabled modes</Label>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          {ALL_MODES.map((mode) => (
            <ModeCheckbox
              key={mode}
              mode={mode}
              checked={enabledModes.has(mode)}
              onChange={() => onToggleMode(mode)}
            />
          ))}
        </div>
        <p className="text-xs text-neutral-400">{MODE_HELP_TEXT}</p>
      </div>
    </section>
  );
}

type NumberFieldProps = {
  id: string;
  label: string;
  hint?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
};

function NumberField({
  id,
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  disabled,
}: NumberFieldProps) {
  return (
    <div className={cn('flex flex-col gap-2', disabled && 'opacity-40')}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        onBlur={(e) => {
          // Re-clamp on blur in case the user typed something out of range.
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
      {hint ? <p className="text-xs text-neutral-400">{hint}</p> : null}
    </div>
  );
}

type ToggleFieldProps = {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
};

function ToggleField({ id, label, hint, checked, onChange }: ToggleFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-3 pt-1">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 cursor-pointer accent-neutral-900"
        />
        <span className="text-sm text-neutral-700">{checked ? 'On' : 'Off'}</span>
      </div>
      {hint ? <p className="text-xs text-neutral-400">{hint}</p> : null}
    </div>
  );
}

function ModeCheckbox({
  mode,
  checked,
  onChange,
}: {
  mode: Mode;
  checked: boolean;
  onChange: () => void;
}) {
  const id = `mode-${mode}`;
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-2 text-sm text-neutral-700"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 cursor-pointer accent-neutral-900"
      />
      <span>Mode {mode}</span>
    </label>
  );
}
