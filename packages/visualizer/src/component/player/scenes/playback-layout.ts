export interface PlaybackViewport {
  offsetX: number;
  offsetY: number;
  contentWidth: number;
  contentHeight: number;
}

export function getPlaybackViewport(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number,
): PlaybackViewport {
  const scale = Math.min(
    containerWidth / imageWidth,
    containerHeight / imageHeight,
  );

  const contentWidth = imageWidth * scale;
  const contentHeight = imageHeight * scale;

  return {
    offsetX: (containerWidth - contentWidth) / 2,
    offsetY: (containerHeight - contentHeight) / 2,
    contentWidth,
    contentHeight,
  };
}
