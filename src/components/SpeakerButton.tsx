import { Button } from './ui/Button';

export function SpeakerButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      onClick={onClick}
      aria-label="Replay name"
      className="text-sm text-neutral-400 hover:text-neutral-900"
    >
      ▶ play name
    </Button>
  );
}
