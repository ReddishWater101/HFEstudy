import { cn } from '../../lib/cn';

type Props = {
  person: PersonWithUuid;
  selected: boolean;
  onToggle: (uuid: string) => void;
  onPreview: (uuid: string) => void;
};

/**
 * Single person tile in the picker grid. Image is the click target for
 * toggling selection. A small "preview" affordance below the name opens
 * the intro video — separated so a single click can't both toggle and
 * preview at the same time.
 */
export function PersonCard({ person, selected, onToggle, onPreview }: Props) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => onToggle(person.uuid)}
        aria-pressed={selected}
        aria-label={`${selected ? 'Deselect' : 'Select'} ${person.firstName}`}
        className="group relative h-20 w-20 overflow-hidden rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
      >
        <img
          src={person.imageUrl}
          alt=""
          className={cn(
            'h-full w-full object-cover transition-all duration-150',
            selected
              ? 'opacity-100 ring-2 ring-neutral-900 ring-offset-2 ring-offset-white'
              : 'opacity-70 group-hover:opacity-100',
          )}
        />
      </button>
      <div className="flex flex-col items-center gap-0.5">
        <span
          className={cn(
            'text-sm transition-colors',
            selected ? 'text-neutral-900' : 'text-neutral-600',
          )}
        >
          {person.firstName}
        </span>
        <button
          type="button"
          onClick={() => onPreview(person.uuid)}
          className="text-[10px] uppercase tracking-widest text-neutral-300 transition-colors hover:text-neutral-900"
        >
          Preview
        </button>
      </div>
    </div>
  );
}
