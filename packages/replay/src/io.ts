import { createHash } from 'node:crypto';
export const sha256 = (bytes: Uint8Array | string) =>
  createHash('sha256').update(bytes).digest('hex');
