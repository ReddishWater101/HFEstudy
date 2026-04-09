import { Button } from '../../components/ui/Button';
import { Label } from '../../components/ui/Label';
import { PersonCard } from './PersonCard';

type Props = {
  people: PersonWithUuid[];
  selectedUuids: Set<string>;
  onToggle: (uuid: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onPreview: (uuid: string) => void;
};

/**
 * Grid of person tiles with a header row that shows the selection count
 * and a single Select-all/Deselect-all toggle. Layout is dense (5 cols)
 * since the builder uses the wide layout.
 */
export function PeopleGrid({
  people,
  selectedUuids,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onPreview,
}: Props) {
  const allSelected = people.length > 0 && selectedUuids.size === people.length;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-end justify-between">
        <div className="flex flex-col gap-2">
          <Label>People</Label>
          <p className="text-sm text-neutral-500">
            {selectedUuids.size} of {people.length} selected
          </p>
        </div>
        <Button
          variant="default"
          onClick={allSelected ? onDeselectAll : onSelectAll}
          className="py-1 text-sm"
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </Button>
      </header>

      {people.length === 0 ? (
        <p className="text-sm text-neutral-400">No people found in the asset directory.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-x-4 gap-y-6">
          {people.map((person) => (
            <PersonCard
              key={person.uuid}
              person={person}
              selected={selectedUuids.has(person.uuid)}
              onToggle={onToggle}
              onPreview={onPreview}
            />
          ))}
        </div>
      )}
    </section>
  );
}
