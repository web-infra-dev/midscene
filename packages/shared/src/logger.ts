import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import debug from 'debug';
import { getMidsceneRunSubDir } from './common';
import { ifInNode } from './utils';

const topicPrefix = 'midscene';
// Map to store file streams
const logStreams = new Map<string, fs.WriteStream>();
const logStreamPaths = new Map<string, string>();
let logDirectoryResolver: (() => string) | undefined;
// A WriteStream queues every write made after it reports backpressure. The
// main process can keep running while macOS has deprioritized a backgrounded
// app, so retaining diagnostic logs here can otherwise grow without bound.
// Drop best-effort logs until the stream drains instead.
const backpressuredLogStreams = new Set<string>();
const unavailableLogStreams = new Set<string>();
// Map to store debug instances
const debugInstances = new Map<string, DebugFunction>();

/**
 * Overrides the directory used by file logs in the current process.
 *
 * Callers that do not configure a resolver keep the standard
 * `midscene_run/log` location. This is intentionally process-local so an app
 * can isolate its logs without changing Node.js or CI behavior.
 */
export function setLogDirectoryResolver(
  resolver: (() => string) | undefined,
): void {
  if (logDirectoryResolver === resolver) return;

  logDirectoryResolver = resolver;
  for (const stream of logStreams.values()) {
    stream.end();
  }
  logStreams.clear();
  logStreamPaths.clear();
  unavailableLogStreams.clear();
  backpressuredLogStreams.clear();
}

function getLogDirectory(): string {
  return logDirectoryResolver?.() ?? getMidsceneRunSubDir('log');
}

// Function to get or create a log stream
function getLogStream(topic: string): fs.WriteStream | null {
  const topicFileName = topic.replace(/:/g, '-');
  if (unavailableLogStreams.has(topicFileName)) {
    return null;
  }
  const logFile = path.join(getLogDirectory(), `${topicFileName}.log`);
  const existingStream = logStreams.get(topicFileName);
  if (existingStream && logStreamPaths.get(topicFileName) !== logFile) {
    existingStream.end();
    logStreams.delete(topicFileName);
    logStreamPaths.delete(topicFileName);
  }
  if (!logStreams.has(topicFileName)) {
    const stream = fs.createWriteStream(logFile, { flags: 'a' });
    // A stream error without a listener terminates the Electron main process.
    // Logging must remain best-effort, so disable this topic after a file error
    // rather than repeatedly queuing writes to a broken stream.
    stream.on('error', () => {
      unavailableLogStreams.add(topicFileName);
      backpressuredLogStreams.delete(topicFileName);
      if (logStreams.get(topicFileName) === stream) {
        logStreams.delete(topicFileName);
        logStreamPaths.delete(topicFileName);
      }
    });
    logStreams.set(topicFileName, stream);
    logStreamPaths.set(topicFileName, logFile);
  }
  return logStreams.get(topicFileName) ?? null;
}

// Function to write log to file
function writeLogToFile(topic: string, message: string): void {
  if (!ifInNode) return;

  const topicFileName = topic.replace(/:/g, '-');
  if (backpressuredLogStreams.has(topicFileName)) {
    return;
  }

  const stream = getLogStream(topic);
  if (!stream) return;
  // Generate ISO format timestamp with local timezone
  const now = new Date();
  // Use sv-SE locale to get ISO-like format (YYYY-MM-DD HH:mm:ss)
  const isoDate = now.toLocaleDateString('sv-SE'); // YYYY-MM-DD
  const isoTime = now.toLocaleTimeString('sv-SE'); // HH:mm:ss
  const milliseconds = now.getMilliseconds().toString().padStart(3, '0');
  // Calculate timezone offset manually for correct format (+HH:mm)
  const timezoneOffsetMinutes = now.getTimezoneOffset();
  const sign = timezoneOffsetMinutes <= 0 ? '+' : '-';
  const hours = Math.floor(Math.abs(timezoneOffsetMinutes) / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (Math.abs(timezoneOffsetMinutes) % 60)
    .toString()
    .padStart(2, '0');
  const timezoneString = `${sign}${hours}:${minutes}`;
  const localISOTime = `${isoDate}T${isoTime}.${milliseconds}${timezoneString}`;
  try {
    if (!stream.write(`[${localISOTime}] ${message}\n`)) {
      backpressuredLogStreams.add(topicFileName);
      stream.once('drain', () => {
        backpressuredLogStreams.delete(topicFileName);
      });
    }
  } catch {
    unavailableLogStreams.add(topicFileName);
    backpressuredLogStreams.delete(topicFileName);
  }
}

export type DebugFunction = (...args: unknown[]) => void;

export function getDebug(
  topic: string,
  options?: { console?: boolean },
): DebugFunction {
  const fullTopic = `${topicPrefix}:${topic}`;
  const withConsole = options?.console ?? false;
  const cacheKey = withConsole ? `${fullTopic}:withConsole` : fullTopic;

  if (!debugInstances.has(cacheKey)) {
    if (withConsole) {
      const baseFn = getDebug(topic);
      const wrapper = (...args: unknown[]): void => {
        baseFn(...args);
        try {
          console.warn('[Midscene]', ...args);
        } catch {
          // Packaged Electron apps can have closed stdio streams. Debug logging
          // must not crash callers just because console output cannot write.
        }
      };
      debugInstances.set(cacheKey, wrapper);
    } else {
      const debugFn = debug(fullTopic) as DebugFunction;

      // Create wrapper that handles both file logging and debug output
      const wrapper = (...args: unknown[]): void => {
        if (ifInNode) {
          const message = util.format(...args);
          writeLogToFile(topic, message);
        }
        debugFn(...args);
      };

      debugInstances.set(cacheKey, wrapper);
    }
  }

  return debugInstances.get(cacheKey)!;
}

export function enableDebug(topic: string): void {
  if (ifInNode) {
    // In Node.js, we don't need to enable debug as we're using file logging
    return;
  }
  debug.enable(`${topicPrefix}:${topic}`);
}
