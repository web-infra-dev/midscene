/**
 * Persistent store for the CDP-mode "current tab" targetId.
 *
 * The Midscene CLI runs each command as a fresh Node process, so anything
 * the previous command knew about which tab was being driven must survive
 * across processes. This store writes the chosen targetId to a temp file
 * after `connect`/`act`/etc. succeed, and the next command reads it back
 * to bind to the exact same tab — even when Chrome holds 14 of them.
 *
 * Owns nothing else. The CDP proxy lifecycle and its own metadata files
 * live in `cdp-proxy-manager.ts`.
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { getDebug } from '@midscene/shared/logger';
import { TARGET_ID_FILE } from './cdp-proxy-constants';

const debug = getDebug('mcp:cdp:target-store');

/**
 * Read the saved targetId, or null if no command has stored one yet.
 */
export function readSavedTargetId(): string | null {
  if (!existsSync(TARGET_ID_FILE)) return null;
  try {
    return readFileSync(TARGET_ID_FILE, 'utf-8').trim() || null;
  } catch {
    return null;
  }
}

/**
 * Save a targetId so the next CLI command can rebind to the same tab.
 */
export function saveTargetId(targetId: string): void {
  try {
    writeFileSync(TARGET_ID_FILE, targetId, 'utf-8');
    debug('Saved targetId: %s', targetId);
  } catch (err) {
    debug('Failed to save targetId: %s', err);
  }
}

/**
 * Discard the saved targetId — call when disconnecting or when the
 * upstream Chrome changes (the targetId would point into the old
 * browser's tab list).
 */
export function cleanupTargetIdFile(): void {
  try {
    if (existsSync(TARGET_ID_FILE)) unlinkSync(TARGET_ID_FILE);
  } catch {}
}
