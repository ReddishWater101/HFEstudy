import { useEffect, useRef } from 'react';
import { Button } from './ui/Button';

export type VideoPlayerProps = {
  src: string;
  onPlayCountChange?: (count: number) => void;
  onEnded?: () => void;
};

export function VideoPlayer({ src, onPlayCountChange, onEnded }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playCountRef = useRef(0);

  // Reset count + autoplay when src changes
  useEffect(() => {
    playCountRef.current = 0;
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    void v.play().catch((err) => {
      console.warn('VideoPlayer autoplay failed:', err);
    });
  }, [src]);

  function handlePlay() {
    playCountRef.current += 1;
    onPlayCountChange?.(playCountRef.current);
  }

  async function handleReplay() {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = 0;
    try {
      await v.play();
    } catch (err) {
      console.warn('VideoPlayer replay failed:', err);
    }
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <video
        key={src}
        ref={videoRef}
        src={src}
        preload="auto"
        playsInline
        onPlay={handlePlay}
        onEnded={onEnded}
        className="max-h-[60vh] w-auto"
      />
      <Button onClick={handleReplay} className="text-sm text-neutral-500 hover:text-neutral-900">
        Replay
      </Button>
    </div>
  );
}
