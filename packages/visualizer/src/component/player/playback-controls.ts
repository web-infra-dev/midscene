export function shouldRestartPlaybackFromBeginning(
  currentFrame: number,
  effectiveEndFrame: number,
): boolean {
  return effectiveEndFrame > 0 && currentFrame >= effectiveEndFrame;
}
