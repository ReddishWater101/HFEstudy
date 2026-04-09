import { useEffect } from 'react';
import { Button } from '../../components/ui/Button';

type Props = {
  person: PersonWithUuid | null;
  onClose: () => void;
};

/**
 * Centered modal that plays a person's intro video. Closes on backdrop click,
 * Esc, or the explicit Close button.
 */
export function PersonPreviewModal({ person, onClose }: Props) {
  useEffect(() => {
    if (!person) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [person, onClose]);

  if (!person) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-white/85 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of ${person.firstName}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-full max-w-[480px] flex-col gap-4 px-6">
        <video
          key={person.uuid}
          src={person.videoUrl}
          autoPlay
          controls
          className="w-full"
        />
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-600">{person.firstName}</span>
          <Button variant="default" onClick={onClose} className="py-1 text-sm">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
