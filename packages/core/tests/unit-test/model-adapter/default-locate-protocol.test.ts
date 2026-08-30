import {
  createDefaultElementProtocol,
  createDefaultSearchAreaProtocol,
} from '@/ai-model/model-adapter/default-locate-protocol';
import {
  buildElementLocateSystemPrompt,
  buildSearchAreaLocateSystemPrompt,
} from '@/ai-model/prompt/locate';
import { parseModelResponseJson } from '@/ai-model/shared/json';
import { createLocateResultPromptSpec } from '@/ai-model/shared/model-locate-result/prompt-spec';
import { describe, expect, it, vi } from 'vitest';

describe('default locate protocol', () => {
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
    ).toThrow('failed to parse LLM response into JSON');

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
    });

    expect(
      elementProtocol.parseRawResponse(
        '{"bbox_2d":[100,200,300,400]}',
        locatePromptSpec,
      ),
    ).toEqual({
      kind: 'not-found',
    });
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
    const jsonParser = vi.fn(() => ({ bbox: [100, 200, 300, 400] }));
    const elementProtocol = createDefaultElementProtocol({ jsonParser });
    const searchAreaProtocol = createDefaultSearchAreaProtocol({ jsonParser });
    const locatePromptSpec = createLocateResultPromptSpec({
      shape: 'bbox',
      order: 'xy',
      normalizedBy: 1000,
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
});
