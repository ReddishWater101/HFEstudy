import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { PROCTOR_PASSWORD } from '../phases/ProctorBuilder/constants';

type Props = {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
};

/**
 * Centered modal that prompts for the proctor password. Used by the welcome
 * screen's gear icon. The plaintext password lives in
 * `phases/ProctorBuilder/constants.ts` (single source of truth — spec §9).
 *
 * Behavior:
 *   - Esc closes (treated as cancel).
 *   - Enter submits.
 *   - Wrong password shows an inline error and clears the input. No throttling.
 *   - Correct password calls `onSuccess` and closes.
 */
export function ProctorPasswordModal({ open, onCancel, onSuccess }: Props) {
  const [attempt, setAttempt] = useState('');
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state whenever the modal opens, and focus the input.
  useEffect(() => {
    if (open) {
      setAttempt('');
      setError(false);
      // Defer focus until after the overlay paints.
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    return;
  }, [open]);

  // Esc to cancel.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  function submit() {
    if (attempt === PROCTOR_PASSWORD) {
      onSuccess();
    } else {
      setError(true);
      setAttempt('');
      inputRef.current?.focus();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-white/85 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="proctor-password-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-[360px] px-12">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <h2
              id="proctor-password-title"
              className="font-display text-3xl leading-none text-neutral-900"
            >
              Proctor access
            </h2>
            <p className="text-sm text-neutral-500">Enter the password to continue.</p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="proctor-password">Password</Label>
            <Input
              ref={inputRef}
              id="proctor-password"
              type="password"
              autoComplete="off"
              value={attempt}
              onChange={(e) => {
                setAttempt(e.target.value);
                if (error) setError(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            {error ? (
              <p className="text-xs text-red-600" role="alert">
                Incorrect password.
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-between">
            <Button variant="default" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit}>
              Enter →
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
