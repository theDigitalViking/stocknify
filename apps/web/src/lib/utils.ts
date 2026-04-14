import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// shadcn/ui utility — merges Tailwind class names without conflicts
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
