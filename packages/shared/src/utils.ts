import { sha256 } from 'js-sha256';
import { v4 as generateUUID } from 'uuid';

declare const WorkerGlobalScope: any;

export const ifInBrowser = typeof window !== 'undefined';
export const ifInWorker = typeof WorkerGlobalScope !== 'undefined';
export const ifInNode =
  typeof process !== 'undefined' && process.versions?.node;

export function uuid(): string {
  return generateUUID();
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

let isMcp = false;

export function setIsMcp(value: boolean) {
  isMcp = value;
}

//mcp need use obj format to console msg: https://github.com/modelcontextprotocol/typescript-sdk/issues/244
export function logMsg(...message: Parameters<typeof console.log>) {
  if (!isMcp) {
    console.log(...message);
  }
}

export async function repeat(
  times: number,
  fn: (index: number) => Promise<void>,
) {
  for (let i = 0; i < times; i++) {
    await fn(i);
  }
}

const REGEXP_LT = /</g;
const REGEXP_GT = />/g;
const REGEXP_LT_ESCAPE = '__midscene_lt__';
const REGEXP_GT_ESCAPE = '__midscene_gt__';

export const escapeScriptTag = (html: string) => {
  return html
    .replace(REGEXP_LT, REGEXP_LT_ESCAPE)
    .replace(REGEXP_GT, REGEXP_GT_ESCAPE);
};

export const antiEscapeScriptTag = (html: string) => {
  const REGEXP_LT = new RegExp(REGEXP_LT_ESCAPE, 'g');
  const REGEXP_GT = new RegExp(REGEXP_GT_ESCAPE, 'g');

  return html.replace(REGEXP_LT, '<').replace(REGEXP_GT, '>');
};

export function replaceIllegalPathCharsAndSpace(str: string) {
  // Only replace characters that are illegal in filenames, but preserve path separators
  return str.replace(/[:*?"<>| ]/g, '-');
}
