import { useEffect, useMemo, useReducer, useState } from 'react';
import { WideLayout } from '../../components/WideLayout';
import { Button } from '../../components/ui/Button';
import { useDispatch } from '../../state/SessionProvider';
import { describeEvenSplit } from '../../lib/evenSplit';
import { ConfigSection } from './ConfigSection';
import { PeopleGrid } from './PeopleGrid';
import { PersonPreviewModal } from './PersonPreviewModal';
import { ResultsAnalyzer } from './ResultsAnalyzer';
import { ResultsSimulator } from './ResultsSimulator';
import { builderReducer, initialBuilderState } from './reducer';

export function ProctorBuilder() {
  const dispatch = useDispatch();
  const [state, builderDispatch] = useReducer(builderReducer, initialBuilderState);
  const [people, setPeople] = useState<PersonWithUuid[]>([]);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await window.api.getPeopleWithUuids();
        if (!cancelled) setPeople(list);
      } catch (err) {
        if (!cancelled) {
          setPeopleError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const splitMessage = useMemo(
    () => describeEvenSplit(state.selectedUuids.size, state.enabledModes.size).message,
    [state.selectedUuids, state.enabledModes],
  );

  const previewingPerson = useMemo(() => {
    if (!state.previewingUuid) return null;
    return people.find((p) => p.uuid === state.previewingUuid) ?? null;
  }, [state.previewingUuid, people]);

  function buildConfig(): StudyConfig | null {
    if (state.selectedUuids.size === 0) {
      builderDispatch({ type: 'setError', message: 'Select at least one person.' });
      return null;
    }
    if (state.enabledModes.size === 0) {
      builderDispatch({ type: 'setError', message: 'Enable at least one mode.' });
      return null;
    }
    const orderedUuids = people
      .map((p) => p.uuid)
      .filter((uuid) => state.selectedUuids.has(uuid));
    return {
      version: 1,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      people: orderedUuids,
      flashcardBlockCount: state.flashcardBlockCount,
      flashcardBlockDurationSec: state.flashcardBlockDurationSec,
      snakeEnabled: state.snakeEnabled,
      snakeDurationSec: state.snakeDurationSec,
      enabledModes: Array.from(state.enabledModes).sort((a, b) => a - b),
    };
  }

  async function handleSave() {
    setSaveStatus(null);
    const cfg = buildConfig();
    if (!cfg) return;
    try {
      const result = await window.api.showStudyFileSaveDialog(cfg);
      if (!result) return;
      builderDispatch({ type: 'setError', message: null });
      setSaveStatus(`Saved to ${result.filePath}`);
    } catch (err) {
      builderDispatch({
        type: 'setError',
        message: err instanceof Error ? err.message : 'Save failed',
      });
    }
  }

  async function handleLoad() {
    setSaveStatus(null);
    try {
      const result = await window.api.showStudyFileOpenDialog();
      if (!result) return;
      builderDispatch({ type: 'loadFromConfig', config: result.config });
    } catch (err) {
      builderDispatch({
        type: 'setError',
        message: `Could not load file: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  function handleBack() {
    dispatch({ type: 'clearStudyConfig' });
    dispatch({ type: 'setPhase', phase: { kind: 'welcome' } });
  }

  return (
    <WideLayout>
      <header className="mb-12 flex items-end justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-4xl leading-none text-neutral-900">
            Experiment builder
          </h1>
          <p className="text-sm text-neutral-500">
            Compose, save, and load study files for the welcome screen.
          </p>
        </div>
        <div className="flex items-center gap-6">
          <Button variant="default" onClick={handleBack} className="py-1 text-sm">
            ← Back to welcome
          </Button>
          <Button variant="default" onClick={handleLoad} className="py-1 text-sm">
            Load existing
          </Button>
          <Button variant="primary" onClick={handleSave} className="py-1 text-sm">
            Save study file →
          </Button>
        </div>
      </header>

      {peopleError ? (
        <p className="mb-6 text-sm text-red-600" role="alert">
          Could not load people: {peopleError}
        </p>
      ) : null}

      <div className="flex flex-col gap-12">
        <PeopleGrid
          people={people}
          selectedUuids={state.selectedUuids}
          onToggle={(uuid) => builderDispatch({ type: 'togglePerson', uuid })}
          onSelectAll={() =>
            builderDispatch({
              type: 'selectAll',
              uuids: people.map((p) => p.uuid),
            })
          }
          onDeselectAll={() => builderDispatch({ type: 'deselectAll' })}
          onPreview={(uuid) => builderDispatch({ type: 'openPreview', uuid })}
        />

        <p className="text-sm text-neutral-600" aria-live="polite">
          {splitMessage}
        </p>

        <ConfigSection
          flashcardBlockCount={state.flashcardBlockCount}
          flashcardBlockDurationSec={state.flashcardBlockDurationSec}
          snakeEnabled={state.snakeEnabled}
          snakeDurationSec={state.snakeDurationSec}
          enabledModes={state.enabledModes}
          onBlockCount={(value) => builderDispatch({ type: 'setBlockCount', value })}
          onBlockDuration={(value) => builderDispatch({ type: 'setBlockDuration', value })}
          onSnakeEnabled={(value) => builderDispatch({ type: 'setSnakeEnabled', value })}
          onSnakeDuration={(value) => builderDispatch({ type: 'setSnakeDuration', value })}
          onToggleMode={(mode) => builderDispatch({ type: 'toggleMode', mode })}
        />

        {state.error ? (
          <p className="text-sm text-red-600" role="alert">
            {state.error}
          </p>
        ) : null}

        {saveStatus && !state.error ? (
          <p className="text-sm text-neutral-500" role="status">
            {saveStatus}
          </p>
        ) : null}

        <ResultsAnalyzer />

        <ResultsSimulator />
      </div>

      <PersonPreviewModal
        person={previewingPerson}
        onClose={() => builderDispatch({ type: 'closePreview' })}
      />
    </WideLayout>
  );
}
