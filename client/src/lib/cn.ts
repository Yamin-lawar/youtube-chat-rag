import { clsx, type ClassValue } from 'clsx';

/** Joins class names, skipping the ones that are false or empty. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
