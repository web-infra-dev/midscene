import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  TRACE_VERSION,
  type Trace,
  type TraceEvent,
  type TraceMeta,
} from './trace';

/** Read the metadata, events and frame index from a recorded trace directory. */
export function readTrace(directory: string): Trace & { directory: string } {
  const root = resolve(directory);
  const meta = JSON.parse(
    readFileSync(join(root, 'trace.json'), 'utf8'),
  ) as TraceMeta;
  if (meta.version !== TRACE_VERSION)
    throw new Error(`Unsupported trace version ${meta.version}`);
  const events = readFileSync(join(root, 'events.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as TraceEvent);
  const frames = JSON.parse(
    readFileSync(join(root, 'frames.json'), 'utf8'),
  ) as Record<string, string>;
  return {
    directory: root,
    meta,
    events,
    frames,
  };
}
