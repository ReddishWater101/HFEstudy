import { Button } from './ui/Button';

export type Bucket = 'still-learning' | 'know-it';

export function BucketButtons({ onBucket }: { onBucket: (bucket: Bucket) => void }) {
  return (
    <div className="flex w-full items-center justify-between gap-12">
      <Button onClick={() => onBucket('still-learning')} className="text-neutral-500">
        Still learning
      </Button>
      <Button onClick={() => onBucket('know-it')} className="text-neutral-900">
        I know this
      </Button>
    </div>
  );
}
