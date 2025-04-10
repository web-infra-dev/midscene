import fs from 'node:fs';
import path from 'node:path';
import { sha256 } from 'js-sha256';

export const ifInBrowser = typeof window !== 'undefined';

export function uuid(): string {
  return Math.random().toString(36).substring(2, 15);
}

const hashMap: Record<string, string> = {}; // id - combined

export function generateHashId(rect: any, content = ''): string {
  // Combine the input into a string
  const combined = JSON.stringify({
    content,
    rect,
  });

  // Generates the sha-256 hash value and converts to a-z chars
  let sliceLength = 5;
  let slicedHash = '';
  const hashHex = sha256.create().update(combined).hex();

  // Convert hex to a-z by mapping each hex char to a letter
  const toLetters = (hex: string): string => {
    return hex
      .split('')
      .map((char) => {
        const code = Number.parseInt(char, 16);
        return String.fromCharCode(97 + (code % 26)); // 97 is 'a' in ASCII
      })
      .join('');
  };

  const hashLetters = toLetters(hashHex);

  while (sliceLength < hashLetters.length - 1) {
    slicedHash = hashLetters.slice(0, sliceLength);
    if (hashMap[slicedHash] && hashMap[slicedHash] !== combined) {
      sliceLength++;
      continue;
    }
    hashMap[slicedHash] = combined;
    break;
  }
  return slicedHash;
}

/**
 * A utility function that asserts a condition and throws an error with a message if the condition is false.
 *
 * @param condition - The condition to assert
 * @param message - The error message to throw if the condition is false
 * @throws Error with the provided message if the condition is false
 */
export function assert(condition: any, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

type GlobalScope = typeof window | typeof globalThis | typeof self | undefined;

export function getGlobalScope(): GlobalScope {
  if (typeof window !== 'undefined') {
    return window;
  }

  if (typeof globalThis !== 'undefined') {
    return globalThis;
  }

  if (typeof self !== 'undefined') {
    return self;
  }
  return undefined;
}

export const getMidsceneRunBasePath = (): string => {
  const basePath = path.join(process.cwd(), 'midscene_run');

  // Create a base directory
  if (!fs.existsSync(basePath)) {
    fs.mkdirSync(basePath, { recursive: true });
  }
  return basePath;
};

export const getMidsceneRunPathOfType = (
  type: 'log' | 'report' | 'output' | 'cache',
): string => {
  const basePath = getMidsceneRunBasePath();
  const runPath = path.join(basePath, type);
  if (!fs.existsSync(runPath)) {
    fs.mkdirSync(runPath, { recursive: true });
  }
  return runPath;
};
