import { recoverGeminiRawPixelBboxFromXmlBounds } from '@/ai-model/inspect';
import { describe, expect, it } from 'vitest';

const brightnessXmlContext = `
Page structure data in the below XML format.
__midscene_lt__PageElementsTree__midscene_gt__
  __midscene_lt__SeekBar text="Display brightness" resource-id="com.android.systemui:id/slider" bounds="[42,357][1038,483]" /__midscene_gt__
__midscene_lt__/PageElementsTree__midscene_gt__
`;

describe('recoverGeminiRawPixelBboxFromXmlBounds', () => {
  it('recovers Gemini raw pixel bbox when XML bounds show the intended target', () => {
    const recovered = recoverGeminiRawPixelBboxFromXmlBounds({
      bbox: [357, 42, 483, 168],
      parsedRect: { left: 45, top: 857, width: 137, height: 303 },
      imageWidth: 1080,
      imageHeight: 2400,
      modelFamily: 'gemini',
      targetElementDescription: 'the brightness slider icon',
      extraLocateContext: brightnessXmlContext,
    });

    expect(recovered).toEqual({
      left: 42,
      top: 357,
      width: 127,
      height: 127,
    });
  });

  it('does not recover when the normal Gemini parse already matches the XML target', () => {
    const recovered = recoverGeminiRawPixelBboxFromXmlBounds({
      bbox: [149, 39, 201, 156],
      parsedRect: { left: 42, top: 358, width: 127, height: 126 },
      imageWidth: 1080,
      imageHeight: 2400,
      modelFamily: 'gemini',
      targetElementDescription: 'the brightness slider icon',
      extraLocateContext: brightnessXmlContext,
    });

    expect(recovered).toBeUndefined();
  });

  it('does not recover in cropped search areas', () => {
    const recovered = recoverGeminiRawPixelBboxFromXmlBounds({
      bbox: [357, 42, 483, 168],
      parsedRect: { left: 45, top: 857, width: 137, height: 303 },
      imageWidth: 1080,
      imageHeight: 2400,
      modelFamily: 'gemini',
      targetElementDescription: 'the brightness slider icon',
      extraLocateContext: brightnessXmlContext,
      hasSearchConfig: true,
    });

    expect(recovered).toBeUndefined();
  });
});
