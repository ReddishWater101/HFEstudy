import { startTransition, useDeferredValue, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import {
  buildAnalyzerBatch,
  exportAnalyzerBatch,
  parseResultZip,
  type AnalyzerBatch,
  type UploadFailure,
  type UploadedAnalysisSession,
} from '../../lib/resultsAnalyzer';
import { LearningRateChart } from './LearningRateChart';
import { RecallTimeChart } from './RecallTimeChart';
import { AccuracyChart } from './AccuracyChart';

type PickerMode = 'replace' | 'append';

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ResultsAnalyzer() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pickerModeRef = useRef<PickerMode>('replace');
  const [sessions, setSessions] = useState<UploadedAnalysisSession[]>([]);
  const [failures, setFailures] = useState<UploadFailure[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const batch = useMemo(() => buildAnalyzerBatch(sessions, failures), [sessions, failures]);
  const deferredBatch = useDeferredValue(batch);
  const hasData = deferredBatch.sessions.length > 0;

  function openPicker(mode: PickerMode) {
    pickerModeRef.current = mode;
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.click();
    }
  }

  async function handleFileSelection(fileList: FileList | null) {
    const files = Array.from(fileList ?? []).filter((file) =>
      file.name.toLowerCase().endsWith('.zip'),
    );
    if (files.length === 0) return;

    setIsLoading(true);
    setBusyLabel(`Parsing ${pluralize(files.length, 'ZIP')}...`);
    setGlobalError(null);

    const results = await Promise.all(
      files.map(async (file) => {
        try {
          return { session: await parseResultZip(file), failure: null };
        } catch (error) {
          return {
            session: null,
            failure: { fileName: file.name, message: errorMessage(error) } satisfies UploadFailure,
          };
        }
      }),
    );

    const nextSessions = results.flatMap((r) => (r.session ? [r.session] : []));
    const nextFailures = results.flatMap((r) => (r.failure ? [r.failure] : []));
    const pickerMode = pickerModeRef.current;

    startTransition(() => {
      setSessions((current) => (pickerMode === 'append' ? [...current, ...nextSessions] : nextSessions));
      setFailures((current) => (pickerMode === 'append' ? [...current, ...nextFailures] : nextFailures));
    });

    if (nextSessions.length === 0) {
      setGlobalError('None of the selected ZIP files could be parsed.');
    }

    setBusyLabel(null);
    setIsLoading(false);
  }

  async function handleExport(batchToExport: AnalyzerBatch) {
    if (batchToExport.sessions.length === 0) return;
    setGlobalError(null);
    setBusyLabel('Building analysis export...');
    try {
      await exportAnalyzerBatch(batchToExport);
    } catch (error) {
      setGlobalError(errorMessage(error));
    } finally {
      setBusyLabel(null);
    }
  }

  function clearUploads() {
    startTransition(() => {
      setSessions([]);
      setFailures([]);
    });
    setGlobalError(null);
  }

  return (
    <section className="flex flex-col gap-6 bg-neutral-50 px-8 py-8">
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        multiple
        className="hidden"
        onChange={(event) => void handleFileSelection(event.target.files)}
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex max-w-3xl flex-col gap-2">
          <span className="text-xs uppercase tracking-widest text-neutral-400">
            Statistics analysis
          </span>
          <h2 className="font-display text-3xl leading-none text-neutral-900">
            Three dependent variables by mode
          </h2>
          <p className="text-sm text-neutral-500">
            Upload participant ZIPs. Everything runs in the browser. The charts below
            compare the four modes on learning rate, recall time, and testing accuracy.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-5 text-sm">
          <Button
            variant="default"
            onClick={() => openPicker(hasData ? 'append' : 'replace')}
            disabled={isLoading}
            className="py-1"
          >
            {hasData ? 'Add ZIPs ->' : 'Upload result ZIPs ->'}
          </Button>
          {hasData ? (
            <>
              <Button
                variant="default"
                onClick={() => openPicker('replace')}
                disabled={isLoading}
                className="py-1"
              >
                Replace batch
              </Button>
              <Button
                variant="default"
                onClick={() => void handleExport(deferredBatch)}
                disabled={isLoading}
                className="py-1"
              >
                Download CSVs
              </Button>
              <Button variant="default" onClick={clearUploads} disabled={isLoading} className="py-1">
                Clear
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <StatusStrip
        busyLabel={busyLabel}
        globalError={globalError}
        participantCount={deferredBatch.participantCount}
        failureCount={deferredBatch.failures.length}
        hasData={hasData}
      />

      {hasData ? (
        <div className="flex flex-col gap-6">
          <LearningRateChart data={deferredBatch.learning} anova={deferredBatch.anovaLearning} />
          <RecallTimeChart data={deferredBatch.recallTime} anova={deferredBatch.anovaRecallTime} />
          <AccuracyChart data={deferredBatch.accuracy} anova={deferredBatch.anovaAccuracy} />
        </div>
      ) : !isLoading ? (
        <div className="flex max-w-2xl flex-col gap-2 text-sm text-neutral-500">
          <p>
            Drop in one or many participant ZIPs to generate the three charts.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function StatusStrip({
  busyLabel,
  globalError,
  participantCount,
  failureCount,
  hasData,
}: {
  busyLabel: string | null;
  globalError: string | null;
  participantCount: number;
  failureCount: number;
  hasData: boolean;
}) {
  if (!busyLabel && !globalError && !hasData && failureCount === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
      {hasData ? (
        <span className="text-neutral-500">
          {pluralize(participantCount, 'participant')} loaded
        </span>
      ) : null}
      {failureCount > 0 ? (
        <span className="text-amber-700">
          {pluralize(failureCount, 'ZIP')} could not be parsed and were skipped
        </span>
      ) : null}
      {busyLabel ? (
        <span className="text-neutral-500" role="status">
          {busyLabel}
        </span>
      ) : null}
      {globalError ? (
        <span className="text-red-600" role="alert">
          {globalError}
        </span>
      ) : null}
    </div>
  );
}
