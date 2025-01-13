import { sha256 } from 'js-sha256';

export const ifInBrowser = typeof window !== 'undefined';

export function uuid() {
  return Math.random().toString(36).substring(2, 15);
}

const hashMap: Record<string, string> = {}; // id - combined

let frameId = 0;

export function getFrameId(): number {
  return frameId;
}

export function setFrameId(id: number) {
  frameId = id;
}

export function generateHashId(rect: any, content = '') {
  // Combine the input into a string
  const combined = JSON.stringify({
    content,
    rect,
    _midscene_frame_id: getFrameId(),
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
