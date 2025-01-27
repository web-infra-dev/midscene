import { sha256 } from 'js-sha256';

export const ifInBrowser = typeof window !== 'undefined';

export function uuid() {
  return Math.random().toString(36).substring(2, 15);
}

const hashMap: Record<string, string> = {}; // id - combined

export function generateHashId(rect: any, content = '') {
  // Combine the input into a string
  const combined = JSON.stringify({
    content,
    rect,
  });

  // Generates the sha-256 hash value
  let sliceLength = 8;
  let slicedHash = '';
  const hashHex = sha256.create().update(combined).hex();
  while (sliceLength < hashHex.length - 1) {
    slicedHash = hashHex.slice(0, sliceLength);
    if (hashMap[slicedHash] && hashMap[slicedHash] !== combined) {
      sliceLength++;
      continue;
    }
    hashMap[slicedHash] = combined;
    break;
  }
  return slicedHash;
}
