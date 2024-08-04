// https://coolors.co/palettes/popular/#01204e
const sectionColor = ['#028391'];
const elementColor = ['#fb6107'];
const highlightColorForSection = '#01204E';
const highlightColorForElement = '#F56824'; // @main-orange

function djb2Hash(str?: string): number {
  if (!str) {
    console.warn('djb2Hash: empty string');
    str = 'unnamed';
  }
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i); // hash * 33 + c
  }
  return hash >>> 0; // Convert to unsigned 32
}

export function colorForName(
  type: 'section' | 'element',
  name: string,
): string {
  const hashNumber = djb2Hash(name);
  if (type === 'section') {
    return sectionColor[hashNumber % sectionColor.length];
  }
  return elementColor[hashNumber % elementColor.length];
}

export function highlightColorForType(type: 'section' | 'element'): string {
  if (type === 'section') {
    return highlightColorForSection;
  }
  return highlightColorForElement;
}
