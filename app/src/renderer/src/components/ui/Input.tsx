import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'w-full border-b border-neutral-200 bg-transparent py-2 text-base text-neutral-900 outline-none transition-colors placeholder:text-neutral-300 focus:border-neutral-900',
        className,
      )}
      {...props}
    />
  );
});
