import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './ui/Button';

const START_THRESHOLD_SECONDS = 0.15;
const STALL_THRESHOLD_MS = 5000;
const MAX_AUTO_RETRIES = 3;
const RETRY_DELAY_MS = 300;

export type VideoPlayerProps = {
  src: string;
  title: string;
  autoReplay?: boolean;
  onPlayCountChange?: (count: number) => void;
  onEnded?: (count: number) => void;
  onLoadError?: () => void;
  onStall?: () => void;
};

/**
 * Robust video player with automatic retry on transient errors.
 * Uses a React `key` to force a fresh <video> element when the src
 * changes or when a retry is needed, avoiding stale-state bugs.
 *
 * When `autoReplay` is true the video automatically plays a second time
 * after the first play completes (no user interaction required).
 */
export function VideoPlayer({
  src,
  title,
  autoReplay = false,
  onPlayCountChange,
  onEnded,
  onLoadError,
  onStall,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const startedPlayCountRef = useRef(0);
  const completedPlayCountRef = useRef(0);
  const countedCurrentPlayRef = useRef(false);
  const stallTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const autoRetryCountRef = useRef(0);

  const [hasLoadError, setHasLoadError] = useState(false);
  const [isStalled, setIsStalled] = useState(false);
  // Incrementing videoKey forces React to mount a brand-new <video> element.
  const [videoKey, setVideoKey] = useState(0);

  function clearStallTimer() {
    if (stallTimerRef.current !== null) {
      window.clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }

  function clearRetryTimer() {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }

  // Reset everything when the src changes (new person).
  useEffect(() => {
    startedPlayCountRef.current = 0;
    completedPlayCountRef.current = 0;
    countedCurrentPlayRef.current = false;
    autoRetryCountRef.current = 0;
    setHasLoadError(false);
    setIsStalled(false);
    clearStallTimer();
    clearRetryTimer();
    // Force a fresh video element for the new src.
    setVideoKey((k) => k + 1);

    return () => {
      clearStallTimer();
      clearRetryTimer();
    };
  }, [src]);

  // Autoplay whenever the video element mounts (new key).
  const videoCallbackRef = useCallback(
    (node: HTMLVideoElement | null) => {
      // Keep the mutable ref in sync
      (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = node;
      if (!node) return;

      // Wait for enough data to be buffered, then play.
      const attemptPlay = () => {
        node.play().catch((err) => {
          console.warn('VideoPlayer autoplay failed:', err);
        });
      };

      if (node.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        attemptPlay();
      } else {
        node.addEventListener('canplay', attemptPlay, { once: true });
      }
    },
    // videoKey in deps ensures we get a fresh callback per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [videoKey],
  );

  function handlePlay() {
    const video = videoRef.current;
    if (video && !countedCurrentPlayRef.current && video.currentTime <= START_THRESHOLD_SECONDS) {
      startedPlayCountRef.current += 1;
      countedCurrentPlayRef.current = true;
      onPlayCountChange?.(startedPlayCountRef.current);
    }

    setHasLoadError(false);
  }

  function handleError() {
    // Auto-retry a few times before surfacing the error to the user.
    if (autoRetryCountRef.current < MAX_AUTO_RETRIES) {
      autoRetryCountRef.current += 1;
      console.warn(
        `VideoPlayer: transient error, auto-retry ${autoRetryCountRef.current}/${MAX_AUTO_RETRIES}`,
      );
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        setVideoKey((k) => k + 1);
      }, RETRY_DELAY_MS);
      return;
    }

    setHasLoadError(true);
    onLoadError?.();
  }

  function handleEnded() {
    clearStallTimer();
    autoRetryCountRef.current = 0;
    completedPlayCountRef.current += 1;
    countedCurrentPlayRef.current = false;
    onEnded?.(completedPlayCountRef.current);

    // Auto-replay once after the first completed play.
    if (autoReplay && completedPlayCountRef.current === 1) {
      setVideoKey((k) => k + 1);
    }
  }

  function startStallTimer() {
    if (stallTimerRef.current !== null) {
      return;
    }
    stallTimerRef.current = window.setTimeout(() => {
      stallTimerRef.current = null;
      setIsStalled(true);
      onStall?.();
    }, STALL_THRESHOLD_MS);
  }

  function handleWaiting() {
    startStallTimer();
  }

  function handleStalled() {
    startStallTimer();
  }

  function handlePlaying() {
    clearStallTimer();
    setIsStalled(false);
  }

  function handleRetry() {
    setHasLoadError(false);
    setIsStalled(false);
    clearStallTimer();
    clearRetryTimer();
    autoRetryCountRef.current = 0;
    setVideoKey((k) => k + 1);
  }

  // Cache-bust the src with the videoKey so the browser treats each
  // attempt as a fresh resource (avoids cached error responses).
  const effectiveSrc = videoKey === 0 ? src : `${src}${src.includes('?') ? '&' : '?'}_t=${videoKey}`;

  const canRetry = hasLoadError || isStalled;
  const recoveryMessage = hasLoadError
    ? 'Video failed to load.'
    : isStalled
      ? 'Video stalled — click below to retry.'
      : null;

  return (
    <div className="flex flex-col items-center gap-4">
      <video
        key={videoKey}
        ref={videoCallbackRef}
        src={effectiveSrc}
        preload="auto"
        playsInline
        aria-label={title}
        onPlay={handlePlay}
        onPlaying={handlePlaying}
        onWaiting={handleWaiting}
        onStalled={handleStalled}
        onError={handleError}
        onEnded={handleEnded}
        className="max-h-[60vh] w-full"
      />

      {recoveryMessage && <div className="text-sm text-neutral-500">{recoveryMessage}</div>}

      {canRetry && (
        <Button
          onClick={handleRetry}
          type="button"
          className="text-sm text-neutral-500 hover:text-neutral-900"
        >
          Retry
        </Button>
      )}
    </div>
  );
}
