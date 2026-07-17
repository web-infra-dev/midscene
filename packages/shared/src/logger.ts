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
const logStreamBytes = new Map<string, number>();
const logStreamSegments = new Map<string, number>();
const MAX_PARTITIONED_LOG_FILE_BYTES = 20 * 1024 * 1024;
// A WriteStream queues every write made after it reports backpressure. The
// main process can keep running while macOS has deprioritized a backgrounded
// app, so retaining diagnostic logs here can otherwise grow without bound.
// Drop best-effort logs until the stream drains instead.
const backpressuredLogStreams = new Set<string>();
const unavailableLogStreams = new Set<string>();
// Map to store debug instances
const debugInstances = new Map<string, DebugFunction>();

// Function to get or create a log stream
function getLogStream(
  topic: string,
  incomingBytes: number,
): fs.WriteStream | null {
  const topicFileName = topic.replace(/:/g, '-');
  if (unavailableLogStreams.has(topicFileName)) {
    return null;
  }
  const logDir = getMidsceneRunSubDir('log');
  const partitioned = process.env.MIDSCENE_RUN_DATE_PARTITIONS === '1';
  const existingStream = logStreams.get(topicFileName);
  const existingPath = logStreamPaths.get(topicFileName);
  const crossedPartition =
    partitioned && existingPath && path.dirname(existingPath) !== logDir;
  const exceededSize =
    partitioned &&
    existingStream &&
    (logStreamBytes.get(topicFileName) ?? 0) + incomingBytes >
      MAX_PARTITIONED_LOG_FILE_BYTES;
  if (existingStream && (crossedPartition || exceededSize)) {
    existingStream.end();
    logStreams.delete(topicFileName);
    logStreamPaths.delete(topicFileName);
    logStreamBytes.delete(topicFileName);
    logStreamSegments.set(
      topicFileName,
      crossedPartition ? 0 : (logStreamSegments.get(topicFileName) ?? 0) + 1,
    );
  }
  if (!logStreams.has(topicFileName)) {
    const segment = logStreamSegments.get(topicFileName) ?? 0;
    const logFile = path.join(
      logDir,
      partitioned
        ? segment === 0
          ? `${topicFileName}.log`
          : `${topicFileName}.${segment}.log`
        : `${topicFileName}.log`,
    );
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
        logStreamBytes.delete(topicFileName);
      }
    });
    logStreams.set(topicFileName, stream);
    logStreamPaths.set(topicFileName, logFile);
    logStreamBytes.set(topicFileName, 0);
  }
  logStreamBytes.set(
    topicFileName,
    (logStreamBytes.get(topicFileName) ?? 0) + incomingBytes,
  );
  return logStreams.get(topicFileName) ?? null;
}

// Function to write log to file
function writeLogToFile(topic: string, message: string): void {
  if (!ifInNode) return;

  const topicFileName = topic.replace(/:/g, '-');
  if (backpressuredLogStreams.has(topicFileName)) {
    return;
  }

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
  const line = `[${localISOTime}] ${message}\n`;
  const stream = getLogStream(topic, Buffer.byteLength(line));
  if (!stream) return;
  try {
    if (!stream.write(line)) {
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
