import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Safely converts any value to a displayable string for JSX.
 * Guards against the "Objects are not valid as a React child" error that
 * occurs when DB fields contain JSON objects instead of primitive strings.
 *
 * @example
 *   safeString({ name: 'Liberal Arts' }) // → 'Liberal Arts'
 *   safeString('Public')                 // → 'Public'
 *   safeString(null)                     // → ''
 */
export function safeString(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    // Common patterns: { name: "..." }, { label: "..." }, { value: "..." }
    for (const key of ['name', 'label', 'value', 'title', 'text']) {
      if (typeof obj[key] === 'string') return obj[key] as string;
    }
    try {
      return JSON.stringify(val);
    } catch {
      return '[object]';
    }
  }
  return String(val);
}
