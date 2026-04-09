import { useEffect, useState } from 'react';
import { Layout } from '../components/Layout';
import { Button } from '../components/ui/Button';

type State =
  | { kind: 'finalizing' }
  | { kind: 'ready'; exportDir: string }
  | { kind: 'error'; message: string };

type DownloadState =
  | { kind: 'idle' }
  | { kind: 'downloading' }
  | { kind: 'done' }
  | { kind: 'error' };

export function EndPhase() {
  const [state, setState] = useState<State>({ kind: 'finalizing' });
  const [dlState, setDlState] = useState<DownloadState>({ kind: 'idle' });

  useEffect(() => {
    let cancelled = false;
    void window.api
      .finalizeSession()
      .then(({ exportDir }) => {
        if (!cancelled) setState({ kind: 'ready', exportDir });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDownload() {
    setDlState({ kind: 'downloading' });
    try {
      await window.api.downloadSessionZip();
      setDlState({ kind: 'done' });
    } catch (err) {
      console.error('downloadSessionZip failed:', err);
      setDlState({ kind: 'error' });
    }
  }

  function handleQuit() {
    void window.api.quit();
  }

  return (
    <Layout>
      <div className="flex flex-col gap-16 py-24">
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-5xl leading-none text-neutral-900">Thank you</h1>
          <p className="text-sm text-neutral-500">
            Your session is complete. The data has been saved.
          </p>
        </div>

        {state.kind === 'finalizing' && (
          <div className="text-sm text-neutral-400">Finalizing...</div>
        )}

        {state.kind === 'error' && (
          <div className="text-sm text-red-600">Could not finalize: {state.message}</div>
        )}

        <div className="flex flex-col gap-6">
          <Button
            variant="primary"
            onClick={handleDownload}
            disabled={state.kind !== 'ready' || dlState.kind === 'downloading'}
            className="self-start"
          >
            {dlState.kind === 'downloading'
              ? 'Saving...'
              : dlState.kind === 'done'
                ? 'Downloaded!'
                : 'Download results \u2192'}
          </Button>
          {dlState.kind === 'error' && (
            <p className="text-sm text-red-600">Download failed. Please try again.</p>
          )}
          <Button onClick={handleQuit} className="self-start text-neutral-500">
            Start over
          </Button>
        </div>
      </div>
    </Layout>
  );
}
