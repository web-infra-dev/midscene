import type { SubGoal, SubGoalStatus } from '@/types';

/**
 * Extract content from an XML tag in a string, searching from the end.
 * This approach handles cases where models prepend thinking content (like <think>...</think>)
 * before the actual response tags, or when there are incomplete/nested tags.
 *
 * Strategy: Find the LAST closing tag, then search backwards for the nearest opening tag.
 * This ensures we get the last complete tag pair, even if there are incomplete tags before it.
 *
 * @param xmlString - The XML string to parse
 * @param tagName - The name of the tag to extract (case-insensitive)
 * @returns The trimmed content of the tag, or undefined if not found
 */
export function extractXMLTag(
  xmlString: string,
  tagName: string,
): string | undefined {
  const lowerXmlString = xmlString.toLowerCase();
  const lowerTagName = tagName.toLowerCase();
  const closeTag = `</${lowerTagName}>`;
  const openTag = `<${lowerTagName}>`;

  // Find the last closing tag
  const lastCloseIndex = lowerXmlString.lastIndexOf(closeTag);
  if (lastCloseIndex === -1) {
    return undefined;
  }

  // Search backwards from the closing tag to find the nearest opening tag
  const searchArea = lowerXmlString.substring(0, lastCloseIndex);
  const lastOpenIndex = searchArea.lastIndexOf(openTag);
  if (lastOpenIndex === -1) {
    return undefined;
  }

  // Extract content between the tags (use original string to preserve case)
  const contentStart = lastOpenIndex + openTag.length;
  const contentEnd = lastCloseIndex;
  const content = xmlString.substring(contentStart, contentEnd);

  return content.trim();
}

/**
 * Parse sub-goals from XML content
 * Handles both formats:
 * - <sub-goal index="1" status="pending">description</sub-goal>
 * - <sub-goal index="1" status="finished" />
 */
export function parseSubGoalsFromXML(xmlContent: string): SubGoal[] {
  const subGoals: SubGoal[] = [];

  // Match both self-closing and regular sub-goal tags
  const regex =
    /<sub-goal\s+index="(\d+)"\s+status="(pending|finished)"(?:\s*\/>|>([\s\S]*?)<\/sub-goal>)/gi;

  let match: RegExpExecArray | null;
  match = regex.exec(xmlContent);
  while (match !== null) {
    const index = Number.parseInt(match[1], 10);
    const status = match[2] as SubGoalStatus;
    const description = match[3]?.trim() || '';

    subGoals.push({ index, status, description });
    match = regex.exec(xmlContent);
  }

  return subGoals;
}

/**
 * Extract indexes of sub-goals marked as finished from <mark-sub-goal-done> content
 */
export function parseMarkFinishedIndexes(xmlContent: string): number[] {
  const indexes: number[] = [];

  // Match self-closing sub-goal tags with status="finished"
  const regex = /<sub-goal\s+index="(\d+)"\s+status="finished"\s*\/>/gi;

  let match: RegExpExecArray | null;
  match = regex.exec(xmlContent);
  while (match !== null) {
    indexes.push(Number.parseInt(match[1], 10));
    match = regex.exec(xmlContent);
  }

  return indexes;
}

export const distanceThreshold = 16;

export function distance(
  point1: { x: number; y: number },
  point2: { x: number; y: number },
) {
  return Math.sqrt((point1.x - point2.x) ** 2 + (point1.y - point2.y) ** 2);
}
