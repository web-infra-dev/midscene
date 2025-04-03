import fs from 'node:fs';
import path from 'node:path';
import debug from 'debug';
import { isNodeEnv, logDir } from './common';

const topicPrefix = 'midscene';
// Map to store file streams
const logStreams = new Map<string, fs.WriteStream>();

// Function to get or create a log stream
function getLogStream(topic: string): fs.WriteStream {
  const topicFileName = topic.replace(/:/g, '-');
  if (!logStreams.has(topicFileName)) {
    const logFile = path.join(logDir, `${topicFileName}.log`);
    const stream = fs.createWriteStream(logFile, { flags: 'a' });
    logStreams.set(topicFileName, stream);
  }
  return logStreams.get(topicFileName)!;
}

// Function to write log to file
function writeLogToFile(topic: string, message: string): void {
  if (!isNodeEnv) return;

  const stream = getLogStream(topic);
  const timestamp = new Date().toISOString();
  stream.write(`[${timestamp}] ${message}\n`);
}

export type DebugFunction = (...args: unknown[]) => void;

export function getDebug(topic: string): DebugFunction {
  // Create a wrapper function that handles both file logging and debug output
  return (...args: unknown[]): void => {
    const message = args
      .map((arg) =>
        typeof arg === 'object'
          ? JSON.stringify(arg, (key, value) =>
              typeof value === 'bigint' ? `${value.toString()}n` : value,
            )
          : String(arg),
      )
      .join(' ');

    if (isNodeEnv) {
      writeLogToFile(topic, message);
    }

    const debugFn = debug(`${topicPrefix}:${topic}`) as DebugFunction;
    debugFn(...args);
  };
}

export function enableDebug(topic: string): void {
  if (isNodeEnv) {
    // In Node.js, we don't need to enable debug as we're using file logging
    return;
  }
  debug.enable(`${topicPrefix}:${topic}`);
}

// Cleanup function to close all log streams
export function cleanupLogStreams(): void {
  if (!isNodeEnv) return;

  for (const stream of logStreams.values()) {
    stream.end();
  }
  logStreams.clear();
}
