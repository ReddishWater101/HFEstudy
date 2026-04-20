import { useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import {
  simulateResultsZip,
  triggerSimulatorDownload,
  validateStudyConfig,
} from '../../lib/resultsSimulator';

const MIN_N = 1;
const MAX_N = 500;

export function ResultsSimulator() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [config, setConfig] = useState<StudyConfig | null>(null);
  const [configFileName, setConfigFileName] = useState<string | null>(null);
  const [sampleSize, setSampleSize] = useState<number>(20);
  const [isBusy, setIsBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  function openFilePicker() {
    if (!fileInputRef.current) return;
    fileInputRef.current.value = '';
    fileInputRef.current.click();
  }

  async function handleFileSelected(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setError(null);
    setStatus(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const result = validateStudyConfig(parsed);
      if (!result.ok) {
        setConfig(null);
        setConfigFileName(null);
        setError(`Invalid study config: ${result.error}`);
        return;
      }
      setConfig(result.config);
      setConfigFileName(file.name);
      setStatus(null);
    } catch (err) {
      setConfig(null);
      setConfigFileName(null);
      setError(`Could not parse JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleDownload() {
    if (!config) return;
    const clamped = Math.min(MAX_N, Math.max(MIN_N, Math.floor(sampleSize)));
    if (clamped !== sampleSize) setSampleSize(clamped);
    setError(null);
    setStatus(null);
    setIsBusy(true);
    setProgress({ done: 0, total: clamped });
    try {
      const blob = await simulateResultsZip(config, clamped, (done, total) => {
        setProgress({ done, total });
      });
      triggerSimulatorDownload(blob, clamped);
      setStatus(`Generated ${clamped} simulated participant ZIP${clamped === 1 ? '' : 's'}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProgress(null);
      setIsBusy(false);
    }
  }

  function clearConfig() {
    setConfig(null);
    setConfigFileName(null);
    setError(null);
    setStatus(null);
  }

  const configSummary = config
    ? `${config.people.length} people · modes ${config.enabledModes.join(', ')} · ${config.flashcardBlockCount} block${config.flashcardBlockCount === 1 ? '' : 's'}`
    : null;

  return (
    <section className="flex flex-col gap-6 bg-neutral-100 px-8 py-8">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(event) => void handleFileSelected(event.target.files)}
      />

      <div className="flex max-w-3xl flex-col gap-2">
        <span className="text-xs uppercase tracking-widest text-neutral-400">
          Simulator
        </span>
        <h2 className="font-display text-3xl leading-none text-neutral-900">
          Generate synthetic participant ZIPs
        </h2>
        <p className="text-sm text-neutral-500">
          Drop in a <span className="font-mono text-[12px]">.hfestudy.json</span>{' '}
          study config and pick a sample size N. The simulator emits a ZIP of N
          inner participant ZIPs with realistic per-mode distributions for
          learning rate, recall time, and accuracy. Load them into the analyzer
          above to see the resulting charts.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-5 text-sm">
          <Button
            variant="default"
            onClick={openFilePicker}
            disabled={isBusy}
            className="py-1"
          >
            {configFileName ? 'Replace config' : 'Upload .hfestudy.json ->'}
          </Button>

          {configFileName ? (
            <div className="flex flex-wrap items-center gap-3 text-neutral-600">
              <span className="font-mono text-xs">{configFileName}</span>
              <span className="text-neutral-400">{configSummary}</span>
              <Button
                variant="default"
                onClick={clearConfig}
                disabled={isBusy}
                className="py-1 text-xs"
              >
                Clear
              </Button>
            </div>
          ) : (
            <span className="text-neutral-400">No config loaded.</span>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-5 text-sm">
          <label className="flex flex-col gap-1 text-neutral-700">
            <span className="text-xs uppercase tracking-widest text-neutral-400">
              Sample size (N)
            </span>
            <input
              type="number"
              min={MIN_N}
              max={MAX_N}
              value={sampleSize}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10);
                setSampleSize(Number.isFinite(parsed) ? parsed : MIN_N);
              }}
              disabled={isBusy}
              className="w-28 border border-neutral-300 px-2 py-1 tabular-nums"
            />
          </label>

          <Button
            variant="primary"
            onClick={() => void handleDownload()}
            disabled={!config || isBusy}
            className="py-1"
          >
            Download simulated batch
          </Button>

          <span className="text-[11px] text-neutral-400">
            Range {MIN_N}-{MAX_N}.
          </span>
        </div>
      </div>

      <StatusStrip
        progress={progress}
        status={status}
        error={error}
        isBusy={isBusy}
      />
    </section>
  );
}

function StatusStrip({
  progress,
  status,
  error,
  isBusy,
}: {
  progress: { done: number; total: number } | null;
  status: string | null;
  error: string | null;
  isBusy: boolean;
}) {
  if (!progress && !status && !error && !isBusy) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
      {progress ? (
        <span className="text-neutral-500" role="status">
          Simulating {progress.done} / {progress.total}...
        </span>
      ) : null}
      {status ? (
        <span className="text-neutral-500" role="status">
          {status}
        </span>
      ) : null}
      {error ? (
        <span className="text-red-600" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
