/** Describes only the current screenshot, using its size after preprocessing. */
export function imageDimensionsPrompt(
  enabled: boolean,
  size: { width: number; height: number },
): string {
  return enabled
    ? `\nThe current screenshot is ${size.width} pixels wide and ${size.height} pixels high.`
    : '';
}
