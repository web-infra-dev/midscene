/**
 * Extract content from an XML tag in a string
 * @param xmlString - The XML string to parse
 * @param tagName - The name of the tag to extract (case-insensitive)
 * @returns The trimmed content of the tag, or undefined if not found
 */
export function extractXMLTag(
  xmlString: string,
  tagName: string,
): string | undefined {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'i');
  const match = xmlString.match(regex);
  return match ? match[1].trim() : undefined;
}

export const distanceThreshold = 16;

export function distance(
  point1: { x: number; y: number },
  point2: { x: number; y: number },
) {
  return Math.sqrt((point1.x - point2.x) ** 2 + (point1.y - point2.y) ** 2);
}
