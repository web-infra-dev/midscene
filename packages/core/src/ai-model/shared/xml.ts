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
    // Fallback: handle half-open tags like `<action-type>Input` without
    // matching close tag. Extract until the next XML tag boundary.
    const lastOpenIndex = lowerXmlString.lastIndexOf(openTag);
    if (lastOpenIndex === -1) {
      return undefined;
    }

    const contentStart = lastOpenIndex + openTag.length;
    const remaining = xmlString.substring(contentStart);
    const nextTagIndex = remaining.indexOf('<');
    const content =
      nextTagIndex === -1 ? remaining : remaining.substring(0, nextTagIndex);

    return content.trim();
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
