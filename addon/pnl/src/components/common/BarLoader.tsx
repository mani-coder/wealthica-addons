import { cn } from '@/utils/cn';

export function BarLoader({ className }: { className?: string }) {
  return (
    <div className={cn('flex justify-center items-center w-full', className)}>
      <div className="w-full h-2 bg-gray-200 overflow-hidden rounded">
        <div className="h-full bg-emerald-500 animate-loading" />
      </div>
    </div>
  );
}
