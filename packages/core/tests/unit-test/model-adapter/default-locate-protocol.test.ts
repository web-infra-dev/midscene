import {
  createDefaultElementProtocol,
  createDefaultSearchAreaProtocol,
} from '@/ai-model/model-adapter/default-locate-protocol';
import {
  buildElementLocateSystemPrompt,
  buildSearchAreaLocateSystemPrompt,
} from '@/ai-model/prompt/locate';
import { parseModelResponseJson } from '@/ai-model/shared/json';
import { createLocateResultCodec } from '@/ai-model/shared/model-locate-result';
import { createLocateResultPromptSpec } from '@/ai-model/shared/model-locate-result/prompt-spec';
import { describe, expect, it, rs } from '@rstest/core';

describe('default locate protocol', () => {
  it('uses custom fields consistently in prompts, targets and references', () => {
    const { promptSpec } = createLocateResultCodec({
      coordinates: { shape: 'point' },
      resultKey: 'position',
      resultKeyAliases: ['old_position', 'fallback_position'],
    });
    const protocol = createDefaultSearchAreaProtocol({
      jsonParser: parseModelResponseJson,
    });
    const prompt = protocol.buildResponseInstructions(promptSpec);
    expect(prompt).toContain('"position"');
    expect(prompt).toContain('"references_position"');
    expect(prompt).not.toContain('old_position');
    expect(
      protocol.parseRawResponse(
        JSON.stringify({
          position: [10, 20],
          old_position: [30, 40],
          references_position: [[50, 60]],
          references_old_position: [[70, 80]],
        }),
        promptSpec,
      ),
    ).toEqual({ kind: 'located', target: [10, 20], references: [[50, 60]] });
    expect(
      protocol.parseRawResponse(
        JSON.stringify({
          old_position: [30, 40],
          fallback_position: [50, 60],
          references_old_position: [[70, 80]],
        }),
        promptSpec,
      ),
    ).toEqual({ kind: 'located', target: [30, 40], references: [[70, 80]] });
    expect(
      protocol.parseRawResponse(
        JSON.stringify({
          position: [],
          old_position: [30, 40],
        }),
        promptSpec,
      ),
    ).toEqual({ kind: 'not-found' });
    expect(
      protocol.parseRawResponse(
        JSON.stringify({
          position: [10, 20],
          references_position: [],
          references_old_position: [[70, 80]],
        }),
        promptSpec,
      ),
    ).toEqual({ kind: 'located', target: [10, 20] });
    expect(() =>
      protocol.parseRawResponse('{"point":[10,20]}', promptSpec),
    ).toThrow('Missing required coordinate field "position"');
  });

  it('builds the existing JSON locate prompts', () => {
    const elementProtocol = createDefaultElementProtocol({
      jsonParser: parseModelResponseJson,
    });
    const searchAreaProtocol = createDefaultSearchAreaProtocol({
      jsonParser: parseModelResponseJson,
    });
    const locatePromptSpec = createLocateResultPromptSpec({
      shape: 'bbox',
      order: 'xy',
      normalizedBy: 1000,
      rounding: 'round',
    });
    const systemPrompt = buildElementLocateSystemPrompt({
      systemPromptIntroduction: elementProtocol.systemPromptIntroduction,
      responseInstructions:
        elementProtocol.buildResponseInstructions(locatePromptSpec),
    });

    expect(systemPrompt).toContain('```json');
    expect(systemPrompt).toContain('"bbox"');
    expect(systemPrompt).toContain('"error": string // optional');
    expect(systemPrompt).not.toContain('"error"?: string');
    expect(elementProtocol.buildUserPrompt('the Submit button')).toBe(
      'Find: the Submit button',
    );
    expect(elementProtocol.expectedJsonObjectResponse).toBe(true);

    const searchAreaSystemPrompt = buildSearchAreaLocateSystemPrompt({
      systemPromptIntroduction: searchAreaProtocol.systemPromptIntroduction,
      responseInstructions:
        searchAreaProtocol.buildResponseInstructions(locatePromptSpec),
    });
    expect(searchAreaSystemPrompt).toContain('Find a section');
    expect(searchAreaSystemPrompt).toContain('"references_bbox"');
    expect(searchAreaProtocol.buildUserPrompt('the Submit button')).toBe(
      'Find section containing: the Submit button',
    );
    expect(searchAreaProtocol.expectedJsonObjectResponse).toBe(true);
  });

  it('parses the existing JSON locate response', () => {
    const elementProtocol = createDefaultElementProtocol({
      jsonParser: parseModelResponseJson,
    });
    const searchAreaProtocol = createDefaultSearchAreaProtocol({
      jsonParser: parseModelResponseJson,
    });
    const locatePromptSpec = createLocateResultPromptSpec({
      shape: 'bbox',
      order: 'xy',
      normalizedBy: 1000,
      rounding: 'round',
    });

    expect(
      elementProtocol.parseRawResponse(
        '{"bbox":[100,200,300,400]}',
        locatePromptSpec,
      ),
    ).toEqual({
      kind: 'located',
      target: [100, 200, 300, 400],
    });
    expect(() =>
      elementProtocol.parseRawResponse('null', locatePromptSpec),
    ).toThrow(
      'LLM response is valid JSON but does not match the expected schema',
    );

    expect(
      searchAreaProtocol.parseRawResponse(
        '{"bbox":[100,200,300,400],"references_bbox":[]}',
        locatePromptSpec,
      ),
    ).toEqual({
      kind: 'located',
      target: [100, 200, 300, 400],
    });
  });

  it('does not accept bbox_2d aliases by default', () => {
    const elementProtocol = createDefaultElementProtocol({
      jsonParser: parseModelResponseJson,
    });
    const searchAreaProtocol = createDefaultSearchAreaProtocol({
      jsonParser: parseModelResponseJson,
    });
    const locatePromptSpec = createLocateResultPromptSpec({
      shape: 'bbox',
      order: 'xy',
      normalizedBy: 1000,
      rounding: 'round',
    });

    expect(() =>
      elementProtocol.parseRawResponse(
        '{"bbox_2d":[100,200,300,400]}',
        locatePromptSpec,
      ),
    ).toThrow('Missing required coordinate field "bbox"');
    expect(
      elementProtocol.parseRawResponse(
        '{"bbox":[100,200,300,400],"bbox_2d":[500,600,700,800]}',
        locatePromptSpec,
      ),
    ).toEqual({
      kind: 'located',
      target: [100, 200, 300, 400],
    });
    expect(
      searchAreaProtocol.parseRawResponse(
        '{"bbox":[100,200,300,400],"references_bbox_2d":[[500,600,700,800]]}',
        locatePromptSpec,
      ),
    ).toEqual({
      kind: 'located',
      target: [100, 200, 300, 400],
    });
  });

  it('uses the adapter JSON parser', () => {
    const jsonParser = rs.fn(() => ({ bbox: [100, 200, 300, 400] }));
    const elementProtocol = createDefaultElementProtocol({ jsonParser });
    const searchAreaProtocol = createDefaultSearchAreaProtocol({ jsonParser });
    const locatePromptSpec = createLocateResultPromptSpec({
      shape: 'bbox',
      order: 'xy',
      normalizedBy: 1000,
      rounding: 'round',
    });

    expect(
      elementProtocol.parseRawResponse(
        'model-specific response',
        locatePromptSpec,
      ),
    ).toEqual({ kind: 'located', target: [100, 200, 300, 400] });
    expect(jsonParser).toHaveBeenCalledWith('model-specific response', {
      source: 'locate',
    });

    searchAreaProtocol.parseRawResponse(
      'model-specific response',
      locatePromptSpec,
    );
    expect(jsonParser).toHaveBeenLastCalledWith('model-specific response', {
      source: 'section-locator',
    });
  });

  it('rejects a non-object response from a custom JSON parser', () => {
    const jsonParser = rs.fn(() => [
      { bbox: [100, 200, 300, 400] },
      { bbox: [500, 600, 700, 800] },
    ]);
    const elementProtocol = createDefaultElementProtocol({ jsonParser });
    const locatePromptSpec = createLocateResultPromptSpec({
      shape: 'bbox',
      order: 'xy',
      normalizedBy: 1000,
      rounding: 'round',
    });

    expect(() =>
      elementProtocol.parseRawResponse(
        'model-specific response',
        locatePromptSpec,
      ),
    ).toThrow('Expected to be a JSON object, got array');
  });
});
