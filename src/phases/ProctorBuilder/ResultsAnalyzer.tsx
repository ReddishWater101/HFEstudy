import {
  startTransition,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button } from '../../components/ui/Button';
import {
  buildAnalyzerBatch,
  exportAnalyzerBatch,
  parseResultZip,
  type AnalyzerBatch,
  type UploadFailure,
  type UploadedAnalysisSession,
} from '../../lib/resultsAnalyzer';
import { ScatterTrendChart } from './ScatterTrendChart';

type PickerMode = 'replace' | 'append';

type TableColumn<T> = {
  label: string;
  align?: 'left' | 'right';
  render: (row: T) => ReactNode;
};

function formatPercent(value: number | null): string {
  if (value === null) return '--';
  return `${Math.round(value * 100)}%`;
}

function formatSeconds(value: number | null): string {
  if (value === null) return '--';
  return `${value.toFixed(2)}s`;
}

function shortId(value: string | null): string {
  if (!value) return '--';
  return value.length <= 10 ? value : `${value.slice(0, 8)}...`;
}

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
    const files = Array.from(fileList ?? []).filter((file) => file.name.toLowerCase().endsWith('.zip'));
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

    const nextSessions = results.flatMap((result) => (result.session ? [result.session] : []));
    const nextFailures = results.flatMap((result) => (result.failure ? [result.failure] : []));
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
    <section className="flex flex-col gap-8 bg-neutral-50 px-8 py-8">
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
            Results analyzer
          </span>
          <h2 className="font-display text-3xl leading-none text-neutral-900">
            Upload participant ZIPs and review learning trends
          </h2>
          <p className="text-sm text-neutral-500">
            This runs entirely in the browser. It uses each ZIP&apos;s session data to
            chart block-level know-it rates and summarize final recall accuracy,
            response times, IDKs, and timeouts.
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
                Download analysis CSVs
              </Button>
              <Button variant="default" onClick={clearUploads} disabled={isLoading} className="py-1">
                Clear
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {busyLabel ? (
        <p className="text-sm text-neutral-500" role="status">
          {busyLabel}
        </p>
      ) : null}

      {globalError ? (
        <p className="text-sm text-red-600" role="alert">
          {globalError}
        </p>
      ) : null}

      {!hasData && !isLoading ? (
        <div className="flex max-w-2xl flex-col gap-3 text-sm text-neutral-500">
          <p>
            Upload one or many participant ZIPs from the end of the study. The analyzer
            will merge them into a single in-browser dashboard.
          </p>
          <p>
            The learning chart uses each flashcard block&apos;s know-it rate as the
            over-time signal, and the final results section uses the end recall quiz.
          </p>
        </div>
      ) : null}

      {hasData ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              label="Valid ZIPs"
              value={String(deferredBatch.sessions.length)}
              detail={`${pluralize(deferredBatch.failures.length, 'skipped file')}`}
            />
            <MetricCard
              label="Participants"
              value={String(deferredBatch.overall.participantCount)}
              detail={`${pluralize(deferredBatch.averageBlockTrend.length, 'block average')}`}
            />
            <MetricCard
              label="Quiz accuracy"
              value={formatPercent(deferredBatch.overall.overallQuizAccuracy)}
              detail="Final recall quiz"
            />
            <MetricCard
              label="Know-it rate"
              value={formatPercent(deferredBatch.overall.overallKnowItRate)}
              detail="Across all flashcard decisions"
            />
            <MetricCard
              label="Average quiz RT"
              value={formatSeconds(deferredBatch.overall.avgQuizRtSec)}
              detail={`${deferredBatch.overall.idkCount} IDK - ${deferredBatch.overall.timeoutCount} timeout`}
            />
          </div>

          {deferredBatch.warnings.length > 0 ? (
            <div className="flex flex-col gap-2 text-sm text-neutral-500">
              {deferredBatch.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}

          <div className="grid gap-8 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,0.9fr)]">
            <AnalyzerPanel
              label="Learning over time"
              title="Know-it rate by flashcard block"
              description="Each point is one participant in one block. The dark line is the average across participants with data in that block."
            >
              {deferredBatch.blockTrend.length > 0 ? (
                <ScatterTrendChart
                  points={deferredBatch.blockTrend}
                  averagePoints={deferredBatch.averageBlockTrend}
                />
              ) : (
                <p className="text-sm text-neutral-500">
                  No flashcard block data was found in the uploaded sessions.
                </p>
              )}
            </AnalyzerPanel>

            <AnalyzerPanel
              label="Final recall"
              title="End-of-study quiz summary"
              description="These metrics come from quiz answers, IDKs, and timeouts at the end of the study."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <MetricCard
                  label="Accuracy"
                  value={formatPercent(deferredBatch.overall.overallQuizAccuracy)}
                  detail="Correct answers / all quiz prompts"
                />
                <MetricCard
                  label="Average RT"
                  value={formatSeconds(deferredBatch.overall.avgQuizRtSec)}
                  detail="Answers and IDKs only"
                />
                <MetricCard
                  label="IDKs"
                  value={String(deferredBatch.overall.idkCount)}
                  detail="Participants choosing I don't know"
                />
                <MetricCard
                  label="Timeouts"
                  value={String(deferredBatch.overall.timeoutCount)}
                  detail="No answer before the timer expired"
                />
              </div>
            </AnalyzerPanel>
          </div>

          <AnalyzerPanel
            label="Uploaded files"
            title="Session metadata"
            description="Study IDs are shown for traceability, but identities stay de-identified in the dashboard."
          >
            <DataTable
              rows={deferredBatch.uploads}
              keyForRow={(row) => `${row.participantId}-${row.fileName}`}
              columns={[
                { label: 'Participant', render: (row) => row.participantLabel },
                { label: 'File', render: (row) => row.fileName },
                { label: 'Study', render: (row) => shortId(row.studyConfigId) },
                { label: 'Blocks', align: 'right', render: (row) => String(row.blockCount || '--') },
                { label: 'Modes', render: (row) => row.enabledModesLabel },
                { label: 'Size', align: 'right', render: (row) => `${row.fileSizeKb.toFixed(1)} KB` },
              ]}
            />
          </AnalyzerPanel>

          <div className="grid gap-8 xl:grid-cols-2">
            <AnalyzerPanel
              label="Participants"
              title="Per-participant summary"
              description="Useful for spotting outliers before exporting the combined CSVs."
            >
              <DataTable
                rows={deferredBatch.participants}
                keyForRow={(row) => row.participantLabel}
                columns={[
                  { label: 'Participant', render: (row) => row.participantLabel },
                  { label: 'Quiz acc.', align: 'right', render: (row) => formatPercent(row.quizAccuracy) },
                  {
                    label: 'Know-it',
                    align: 'right',
                    render: (row) => formatPercent(row.overallKnowItRate),
                  },
                  {
                    label: 'Quiz RT',
                    align: 'right',
                    render: (row) => formatSeconds(row.avgQuizRtSec),
                  },
                  { label: 'IDK', align: 'right', render: (row) => String(row.idkCount) },
                  { label: 'Timeout', align: 'right', render: (row) => String(row.timeoutCount) },
                ]}
              />
            </AnalyzerPanel>

            <AnalyzerPanel
              label="Mode breakdown"
              title="Final quiz performance by mode"
              description="Mode summaries are merged across all uploaded sessions."
            >
              <DataTable
                rows={deferredBatch.modeQuiz}
                keyForRow={(row) => String(row.mode)}
                columns={[
                  { label: 'Mode', render: (row) => `Mode ${row.mode}` },
                  { label: 'Accuracy', align: 'right', render: (row) => formatPercent(row.accuracy) },
                  { label: 'Quiz RT', align: 'right', render: (row) => formatSeconds(row.avgRtSec) },
                  { label: 'IDK', align: 'right', render: (row) => String(row.idkCount) },
                  { label: 'Timeout', align: 'right', render: (row) => String(row.timeoutCount) },
                ]}
              />
            </AnalyzerPanel>
          </div>

          {deferredBatch.failures.length > 0 ? (
            <AnalyzerPanel
              label="Skipped files"
              title="ZIPs that could not be parsed"
              description="These files were ignored so the rest of the batch could still be analyzed."
            >
              <DataTable
                rows={deferredBatch.failures}
                keyForRow={(row) => `${row.fileName}-${row.message}`}
                columns={[
                  { label: 'File', render: (row) => row.fileName },
                  { label: 'Reason', render: (row) => row.message },
                ]}
              />
            </AnalyzerPanel>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function AnalyzerPanel({
  label,
  title,
  description,
  children,
}: {
  label: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 bg-white px-6 py-6">
      <div className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-widest text-neutral-400">{label}</span>
        <h3 className="font-display text-2xl leading-none text-neutral-900">{title}</h3>
        <p className="max-w-3xl text-sm text-neutral-500">{description}</p>
      </div>
      {children}
    </section>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="flex flex-col gap-1 bg-white px-5 py-5">
      <span className="text-xs uppercase tracking-widest text-neutral-400">{label}</span>
      <span className="font-display text-3xl leading-none text-neutral-900">{value}</span>
      <span className="text-sm text-neutral-500">{detail}</span>
    </div>
  );
}

function DataTable<T>({
  rows,
  columns,
  keyForRow,
}: {
  rows: T[];
  columns: TableColumn<T>[];
  keyForRow: (row: T, index: number) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-separate border-spacing-y-3">
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.label}
                className={`pb-1 text-xs uppercase tracking-widest text-neutral-400 ${
                  column.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={keyForRow(row, index)} className="align-top text-sm text-neutral-700">
              {columns.map((column) => (
                <td
                  key={column.label}
                  className={`bg-neutral-50 px-3 py-3 ${
                    column.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
