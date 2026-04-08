import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/Button';

const START_THRESHOLD_SECONDS = 0.15;
const STALL_THRESHOLD_MS = 5000;

export type VideoPlayerProps = {
  src: string;
  title: string;
  onPlayCountChange?: (count: number) => void;
  onEnded?: (count: number) => void;
  onLoadError?: () => void;
  onStall?: () => void;
};

export function VideoPlayer({
  src,
  title,
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
  const [startedPlayCount, setStartedPlayCount] = useState(0);
  const [completedPlayCount, setCompletedPlayCount] = useState(0);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [isStalled, setIsStalled] = useState(false);

  function clearStallTimer() {
    if (stallTimerRef.current !== null) {
      window.clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }

  useEffect(() => {
    const video = videoRef.current;

    startedPlayCountRef.current = 0;
    completedPlayCountRef.current = 0;
    countedCurrentPlayRef.current = false;
    setStartedPlayCount(0);
    setCompletedPlayCount(0);
    setHasLoadError(false);
    setIsStalled(false);
    clearStallTimer();

    if (!video) {
      return;
    }

    restartVideo(video);
    void playVideo(video, 'autoplay');

    return () => {
      clearStallTimer();
      setIsStalled(false);
    };
  }, [src]);

  function handlePlay() {
    const video = videoRef.current;
    if (video && !countedCurrentPlayRef.current && video.currentTime <= START_THRESHOLD_SECONDS) {
      startedPlayCountRef.current += 1;
      countedCurrentPlayRef.current = true;
      setStartedPlayCount(startedPlayCountRef.current);
      onPlayCountChange?.(startedPlayCountRef.current);
    }

    setHasLoadError(false);
  }

  function handleError() {
    setHasLoadError(true);
    onLoadError?.();
  }

  function handleEnded() {
    clearStallTimer();
    completedPlayCountRef.current += 1;
    setCompletedPlayCount(completedPlayCountRef.current);
    onEnded?.(completedPlayCountRef.current);
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

  function restartVideo(video: HTMLVideoElement) {
    countedCurrentPlayRef.current = false;
    video.pause();

    try {
      video.currentTime = 0;
    } catch (err) {
      console.warn('VideoPlayer seek failed:', err);
    }

    video.load();
  }

  async function playVideo(video: HTMLVideoElement, label: string) {
    try {
      await video.play();
    } catch (err) {
      console.warn(`VideoPlayer ${label} failed:`, err);
      setHasLoadError(true);
      onLoadError?.();
    }
  }

  async function handleReplay() {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    setHasLoadError(false);
    setIsStalled(false);
    clearStallTimer();
    startedPlayCountRef.current = 0;
    setStartedPlayCount(0);

    restartVideo(video);
    await playVideo(video, 'replay');
  }

  const canReplay =
    hasLoadError || isStalled || (completedPlayCount >= 1 && startedPlayCount < 2);
  const inRecoveryState = hasLoadError || isStalled;
  const buttonLabel = inRecoveryState ? 'Retry' : 'Replay from start';
  const recoveryMessage = hasLoadError
    ? 'Video failed to load.'
    : isStalled
      ? 'Video stalled — click below to retry.'
      : null;

  return (
    <div className="flex flex-col items-center gap-4">
      <video
        ref={videoRef}
        src={src}
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

      <div className="flex items-center gap-6 text-sm text-neutral-500">
        <Button
          onClick={handleReplay}
          type="button"
          disabled={!canReplay}
          className="hover:text-neutral-900"
        >
          {buttonLabel}
        </Button>
      </div>
    </div>
  );
}
