import { parseAutoGLMLocateResponse } from '@/ai-model/models/auto-glm/parser';
import { describe, expect, it } from 'vitest';

describe('parseAutoGLMLocateResponse', () => {
  it('should parse locate response with coordinates', () => {
    const response = '<answer>do(action="Tap", element=[500,750])</answer>';
    const result = parseAutoGLMLocateResponse(response);
    expect(result.coordinates).toEqual({ x: 500, y: 750 });
  });

  it('should return error for non-Tap action', () => {
    const response = 'do(action="Swipe", start=[100,200], end=[300,400])';
    const result = parseAutoGLMLocateResponse(response);
    expect(result.error).toBe(
      'Unexpected action type in auto-glm locate response: do(action="Swipe", start=[100,200], end=[300,400])',
    );
    expect(result.coordinates).toBeNull();
  });

  it('should return error for malformed response', () => {
    const response = 'do(action="Tap", invalid=[500,750])';
    const result = parseAutoGLMLocateResponse(response);
    expect(result.error).toBe(
      'Failed to extract element coordinates from auto-glm response: do(action="Tap", invalid=[500,750])',
    );
    expect(result.coordinates).toBeNull();
  });
});
