import type { TModelFamily } from '@midscene/shared/env';
export function bboxDescription(modelFamily: TModelFamily | undefined) {
  if (modelFamily === 'gemini') {
    // Gemini bbox follows Google's documented `box_2d` contract, not Android
    // XML raw pixel bounds. Both Gemini API and Vertex AI docs define the box
    // as [ymin, xmin, ymax, xmax] normalized to 0-1000, then descale y by
    // image height and x by image width.
    // https://ai.google.dev/gemini-api/docs/image-understanding#object-detection
    // https://docs.cloud.google.com/vertex-ai/generative-ai/docs/bounding-box-detection
    return 'box_2d bounding box for the target element, should be [ymin, xmin, ymax, xmax] normalized to 0-1000.';
  }
  return '2d bounding box as [xmin, ymin, xmax, ymax]';
}
