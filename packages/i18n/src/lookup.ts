export function lookup(dict: Record<string, unknown>, key: string): string {
  const segments = key.split('.');
  let cursor: unknown = dict;
  for (const segment of segments) {
    if (cursor && typeof cursor === 'object' && segment in (cursor as object)) {
      cursor = (cursor as Record<string, unknown>)[segment];
    } else {
      throw new Error(`Missing translation key: ${key}`);
    }
  }
  if (typeof cursor !== 'string') {
    throw new Error(`Translation key is not a string: ${key}`);
  }
  return cursor;
}
