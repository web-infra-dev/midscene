import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import debug from 'debug';
import { getMidsceneRunSubDir } from './common';
import { ifInNode } from './utils';

const topicPrefix = 'midscene';
// Map to store file streams
const logStreams = new Map<string, fs.WriteStream>();
// Map to store debug instances
const debugInstances = new Map<string, DebugFunction>();

// Function to get or create a log stream
function getLogStream(topic: string): fs.WriteStream {
  const topicFileName = topic.replace(/:/g, '-');
  if (!logStreams.has(topicFileName)) {
    const logFile = path.join(
      getMidsceneRunSubDir('log'),
      `${topicFileName}.log`,
    );
    const stream = fs.createWriteStream(logFile, { flags: 'a' });
    logStreams.set(topicFileName, stream);
  }
  return logStreams.get(topicFileName)!;
}

// Function to write log to file
function writeLogToFile(topic: string, message: string): void {
  if (!ifInNode) return;

  const stream = getLogStream(topic);
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
  stream.write(`[${localISOTime}] ${message}\n`);
}

export type DebugFunction = (...args: unknown[]) => void;

export function getDebug(topic: string): DebugFunction {
  const fullTopic = `${topicPrefix}:${topic}`;

  if (!debugInstances.has(fullTopic)) {
    const debugFn = debug(fullTopic) as DebugFunction;

    // Create wrapper that handles both file logging and debug output
    const wrapper = (...args: unknown[]): void => {
      if (ifInNode) {
        const message = util.format(...args);
        writeLogToFile(topic, message);
      }
      debugFn(...args);
    };

    debugInstances.set(fullTopic, wrapper);
  }

  return debugInstances.get(fullTopic)!;
}

export function enableDebug(topic: string): void {
  if (ifInNode) {
    // In Node.js, we don't need to enable debug as we're using file logging
    return;
  }
  debug.enable(`${topicPrefix}:${topic}`);
}

// Cleanup function to close all log streams
export function cleanupLogStreams(): void {
  if (!ifInNode) return;

  for (const stream of logStreams.values()) {
    stream.end();
  }
  logStreams.clear();
  debugInstances.clear();
}
