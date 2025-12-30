// Lightweight replacements for lodash functions

/**
 * Convert a string to start case (e.g., "hello world" -> "Hello World")
 */
export function startCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1 $2') // handle camelCase
    .replace(/[_-]/g, ' ') // replace underscores and hyphens with spaces
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Sum values of a specific property in an array of objects
 */
export function sumBy<T>(array: readonly T[], property: keyof T): number {
  return array.reduce((sum, item) => sum + (Number(item[property]) || 0), 0);
}

/**
 * Create an array of numbers from 0 to n-1
 */
export function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  options?: { leading?: boolean; trailing?: boolean },
): T & { cancel: () => void } {
  let timeout: NodeJS.Timeout | null = null;
  let lastArgs: any[] | null = null;
  let lastThis: any = null;

  const leading = options?.leading ?? false;
  const trailing = options?.trailing ?? true;

  const debounced = function (this: any, ...args: any[]) {
    lastArgs = args;
    lastThis = this;

    const shouldCallNow = leading && !timeout;

    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      timeout = null;
      if (trailing && lastArgs) {
        func.apply(lastThis, lastArgs);
      }
    }, wait);

    if (shouldCallNow) {
      func.apply(this, args);
    }
  } as T & { cancel: () => void };

  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return debounced;
}
