import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/Button';

const START_THRESHOLD_SECONDS = 0.15;

export type VideoPlayerProps = {
  src: string;
  title: string;
  onPlayCountChange?: (count: number) => void;
  onEnded?: (count: number) => void;
};

export function VideoPlayer({ src, title, onPlayCountChange, onEnded }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const startedPlayCountRef = useRef(0);
  const completedPlayCountRef = useRef(0);
  const countedCurrentPlayRef = useRef(false);
  const [startedPlayCount, setStartedPlayCount] = useState(0);
  const [completedPlayCount, setCompletedPlayCount] = useState(0);
  const [hasLoadError, setHasLoadError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;

    startedPlayCountRef.current = 0;
    completedPlayCountRef.current = 0;
    countedCurrentPlayRef.current = false;
    setStartedPlayCount(0);
    setCompletedPlayCount(0);
    setHasLoadError(false);

    if (!video) {
      return;
    }

    restartVideo(video);
    void playVideo(video, 'autoplay');
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
  }

  function handleEnded() {
    completedPlayCountRef.current += 1;
    setCompletedPlayCount(completedPlayCountRef.current);
    onEnded?.(completedPlayCountRef.current);
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
    }
  }

  async function handleReplay() {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    restartVideo(video);
    await playVideo(video, 'replay');
  }

  const canReplay = completedPlayCount >= 1 && startedPlayCount < 2;

  return (
    <div className="flex flex-col items-center gap-4">
      <video
        ref={videoRef}
        src={src}
        preload="auto"
        playsInline
        aria-label={title}
        onPlay={handlePlay}
        onError={handleError}
        onEnded={handleEnded}
        className="max-h-[60vh] w-full"
      />

      <div className="flex items-center gap-6 text-sm text-neutral-500">
        <Button
          onClick={handleReplay}
          type="button"
          disabled={!canReplay}
          className="hover:text-neutral-900"
        >
          Replay from start
        </Button>
      </div>

      {hasLoadError && <div className="text-sm text-neutral-500">Video unavailable.</div>}
    </div>
  );
}
