import { randomUUID } from 'node:crypto';

export const ifInBrowser = typeof window !== 'undefined';

export function uuid() {
  if (ifInBrowser) {
    return Math.random().toString(36).substring(2, 15);
  }
  return randomUUID();
}
