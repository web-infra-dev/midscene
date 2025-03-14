import { sha256 } from 'js-sha256';

import debug from 'debug';

export const ifInBrowser = typeof window !== 'undefined';

export function uuid() {
  return Math.random().toString(36).substring(2, 15);
}

const hashMap: Record<string, string> = {}; // id - combined

const topicPrefix = 'midscene';
export function getDebug(topic: string) {
  return debug(`${topicPrefix}:${topic}`);
}

export function enableDebug(topic: string) {
  debug.enable(`${topicPrefix}:${topic}`);
}

export function generateHashId(rect: any, content = '') {
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
  const toLetters = (hex: string) => {
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
