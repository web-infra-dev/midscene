export interface MarkdownScrollMapping {
  scrollTop: number;
  sourceMaxScrollTop: number;
  targetMaxScrollTop: number;
  sourceAnchorOffsets: number[];
  targetAnchorOffsets: number[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeOffsets(offsets: number[], maxScrollTop: number): number[] {
  let previousOffset = 0;

  return offsets.map((offset) => {
    const normalizedOffset = clamp(
      Number.isFinite(offset) ? offset : previousOffset,
      previousOffset,
      maxScrollTop,
    );
    previousOffset = normalizedOffset;
    return normalizedOffset;
  });
}

/**
 * Maps a scroll position between two panes whose content has different
 * heights. Shared screenshot anchors keep the corresponding Markdown link and
 * screenshot card aligned. Content before the first shared anchor has no
 * counterpart, so the target remains at the top until that anchor is reached;
 * the space between later anchors is interpolated for smooth scrolling.
 */
export function mapScrollTopBetweenMarkdownAnchors({
  scrollTop,
  sourceMaxScrollTop,
  targetMaxScrollTop,
  sourceAnchorOffsets,
  targetAnchorOffsets,
}: MarkdownScrollMapping): number {
  const sourceMax = Math.max(0, sourceMaxScrollTop);
  const targetMax = Math.max(0, targetMaxScrollTop);

  if (sourceMax === 0 || targetMax === 0) {
    return 0;
  }

  const position = clamp(scrollTop, 0, sourceMax);
  const anchorCount = Math.min(
    sourceAnchorOffsets.length,
    targetAnchorOffsets.length,
  );

  if (anchorCount === 0) {
    return 0;
  }

  const normalizedSourceAnchors = normalizeOffsets(
    sourceAnchorOffsets.slice(0, anchorCount),
    sourceMax,
  );
  const normalizedTargetAnchors = normalizeOffsets(
    targetAnchorOffsets.slice(0, anchorCount),
    targetMax,
  );

  if (position < normalizedSourceAnchors[0]) {
    return 0;
  }

  const sourcePoints = [0, ...normalizedSourceAnchors, sourceMax];
  const targetPoints = [0, ...normalizedTargetAnchors, targetMax];

  if (position === 0) {
    return 0;
  }
  if (position === sourceMax) {
    return targetMax;
  }

  for (let endIndex = 1; endIndex < sourcePoints.length; endIndex += 1) {
    const sourceEnd = sourcePoints[endIndex];
    if (position > sourceEnd) {
      continue;
    }

    let startIndex = endIndex - 1;
    while (
      startIndex > 0 &&
      sourcePoints[startIndex] === sourcePoints[startIndex - 1]
    ) {
      startIndex -= 1;
    }

    const sourceStart = sourcePoints[startIndex];
    const sourceRange = sourceEnd - sourceStart;
    if (sourceRange === 0) {
      continue;
    }

    const progress = (position - sourceStart) / sourceRange;
    const targetStart = targetPoints[startIndex];
    const targetEnd = targetPoints[endIndex];
    return clamp(
      targetStart + (targetEnd - targetStart) * progress,
      0,
      targetMax,
    );
  }

  return targetMax;
}
