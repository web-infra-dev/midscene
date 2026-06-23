import { describe, expect, it } from 'vitest';
import type { MidsceneRecorderEvent } from '../../src/recorder';
import {
  DEFAULT_MIDSCENE_RECORDER_MARKDOWN_MAX_SCREENSHOTS,
  buildMidsceneRecorderActionSummary,
  buildMidsceneRecorderReplayInstruction,
  createMidsceneRecorderMarkdownScreenshotAssets,
  getMidsceneRecorderEventDescription,
  getMidsceneRecorderScreenshotsForLLM,
  sanitizeMidsceneRecorderFileName,
  stringifyMidsceneRecorderTargetBlock,
} from '../../src/recorder';

describe('recorder shared schema helpers', () => {
  it('accepts unified studio preview recorder events', () => {
    const events: MidsceneRecorderEvent[] = [
      {
        type: 'click',
        source: 'studio-preview',
        pageInfo: { width: 1280, height: 720 },
        timestamp: 1,
        hashId: 'web-preview-click',
      },
      {
        type: 'drag',
        source: 'studio-preview',
        actionType: 'DragAndDrop',
        pageInfo: { width: 390, height: 844 },
        timestamp: 2,
        hashId: 'preview-drag',
      },
      {
        type: 'scroll',
        source: 'studio-preview',
        value: '0,-285',
        pageInfo: { width: 1728, height: 1117 },
        timestamp: 3,
        hashId: 'computer-preview-scroll',
      },
    ];

    expect(events.map((event) => event.source)).toEqual([
      'studio-preview',
      'studio-preview',
      'studio-preview',
    ]);
  });

  it('derives event descriptions with semantic and coordinate fallbacks', () => {
    expect(
      getMidsceneRecorderEventDescription({
        type: 'click',
        actionType: 'Click',
        semantic: {
          source: 'aiDescribe',
          status: 'ready',
          elementDescription: 'Submit button',
        },
        pageInfo: { width: 100, height: 100 },
        timestamp: 1,
        hashId: 'click-1',
      }),
    ).toBe('Submit button');

    expect(
      getMidsceneRecorderEventDescription({
        type: 'click',
        actionType: 'Click',
        elementRect: { x: 10.4, y: 20.6 },
        pageInfo: { width: 100, height: 100 },
        timestamp: 1,
        hashId: 'click-2',
      }),
    ).toBe('Click (10, 21)');
  });

  it('does not expose pending analyzer placeholders as semantic descriptions', () => {
    expect(
      getMidsceneRecorderEventDescription({
        type: 'input',
        actionType: 'Input',
        semantic: {
          source: 'recorderAI',
          status: 'pending',
          elementDescription: 'AI is analyzing element...',
        },
        value: '2',
        pageInfo: { width: 100, height: 100 },
        timestamp: 1,
        hashId: 'input-pending',
      }),
    ).toBe('Input 2');
  });

  it('selects screenshots by timeline distribution and removes duplicates', () => {
    expect(
      getMidsceneRecorderScreenshotsForLLM(
        [
          {
            type: 'scroll',
            screenshotAfter: 'scroll-shot',
            pageInfo: { width: 100, height: 100 },
            timestamp: 3,
            hashId: 'scroll',
          },
          {
            type: 'click',
            screenshotBefore: 'click-before',
            screenshotWithBox: 'click-box',
            pageInfo: { width: 100, height: 100 },
            timestamp: 2,
            hashId: 'click',
          },
          {
            type: 'navigation',
            screenshotAfter: 'nav-shot',
            pageInfo: { width: 100, height: 100 },
            timestamp: 1,
            hashId: 'nav',
          },
          {
            type: 'input',
            screenshotAfter: 'click-box',
            pageInfo: { width: 100, height: 100 },
            timestamp: 4,
            hashId: 'input',
          },
        ],
        3,
      ),
    ).toEqual(['scroll-shot', 'click-box', 'nav-shot']);
  });

  it('serializes recorder targets and sanitizes file names', () => {
    expect(
      stringifyMidsceneRecorderTargetBlock({
        platformId: 'computer',
        label: 'Display',
        values: { displayId: '2' },
      }),
    ).toBe('computer:\n  displayId: "2"');

    expect(sanitizeMidsceneRecorderFileName('Demo / Recording: 1')).toBe(
      'demo-recording-1',
    );
  });

  it('creates stable markdown screenshot assets from recorder events', () => {
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ';
    const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD';
    const assets = createMidsceneRecorderMarkdownScreenshotAssets(
      [
        {
          type: 'navigation',
          screenshotAfter: png,
          pageInfo: { width: 100, height: 100 },
          timestamp: 1,
          hashId: 'nav',
        },
        {
          type: 'click',
          semantic: {
            source: 'aiDescribe',
            status: 'ready',
            elementDescription: 'Submit',
          },
          screenshotWithBox: jpeg,
          pageInfo: { width: 100, height: 100 },
          timestamp: 2,
          hashId: 'click',
        },
        {
          type: 'scroll',
          screenshotAfter: png,
          pageInfo: { width: 100, height: 100 },
          timestamp: 3,
          hashId: 'scroll',
        },
      ],
      {
        baseDir: 'shots',
        maxScreenshots: 3,
      },
    );

    expect(assets).toEqual([
      expect.objectContaining({
        eventIndex: 0,
        eventHashId: 'nav',
        relativePath: './shots/event-001-navigation.png',
        mimeType: 'image/png',
      }),
      expect.objectContaining({
        eventIndex: 1,
        eventHashId: 'click',
        relativePath: './shots/event-002-click.jpg',
        mimeType: 'image/jpeg',
      }),
    ]);
  });

  it('uses 20 markdown screenshot assets as the default cap', () => {
    const events: MidsceneRecorderEvent[] = Array.from(
      { length: DEFAULT_MIDSCENE_RECORDER_MARKDOWN_MAX_SCREENSHOTS + 1 },
      (_, index) => ({
        type: 'scroll',
        screenshotAfter: `data:image/png;base64,shot${index}`,
        pageInfo: { width: 100, height: 100 },
        timestamp: index + 1,
        hashId: `scroll-${index}`,
      }),
    );

    const assets = createMidsceneRecorderMarkdownScreenshotAssets(events);

    expect(assets).toHaveLength(
      DEFAULT_MIDSCENE_RECORDER_MARKDOWN_MAX_SCREENSHOTS,
    );
    expect(assets.at(-1)?.relativePath).toBe(
      './screenshots/event-021-scroll.png',
    );
  });

  it('keeps long recordings visually distributed under a screenshot cap', () => {
    const events: MidsceneRecorderEvent[] = Array.from(
      { length: 10 },
      (_, index) => ({
        type: 'scroll',
        screenshotAfter: `data:image/png;base64,shot${index}`,
        pageInfo: { width: 100, height: 100 },
        timestamp: index + 1,
        hashId: `scroll-${index}`,
      }),
    );

    const assets = createMidsceneRecorderMarkdownScreenshotAssets(events, {
      maxScreenshots: 5,
    });

    expect(assets.map((asset) => asset.eventIndex)).toEqual([0, 1, 5, 8, 9]);
    expect(assets.at(-1)?.relativePath).toBe(
      './screenshots/event-010-scroll.png',
    );
  });

  it('builds canonical semantic replay instructions and action summaries', () => {
    expect(
      buildMidsceneRecorderReplayInstruction(
        { type: 'click', actionType: 'Tap' },
        'Submit button',
      ),
    ).toBe('Tap on the element described as "Submit button".');
    expect(
      buildMidsceneRecorderActionSummary(
        { type: 'click', actionType: 'RightClick' },
        'Context menu item',
      ),
    ).toBe('Right click Context menu item');
    expect(
      buildMidsceneRecorderReplayInstruction(
        { type: 'input', actionType: 'Input', value: 'hello' },
        'message field',
      ),
    ).toBe('Input "hello" into the element described as "message field".');
    expect(
      buildMidsceneRecorderReplayInstruction(
        {
          type: 'scroll',
          actionType: 'Scroll',
          value: 'down 600',
          scrollDestinationDescription: 'settings section',
        },
        'main panel',
      ),
    ).toBe(
      'Scroll the page/region with description "main panel" by value "down 600" until "settings section" is visible.',
    );
    expect(
      buildMidsceneRecorderActionSummary(
        { type: 'navigation', actionType: 'NavigationChanged', url: '/done' },
        '/done',
      ),
    ).toBe('Wait for navigation to complete at /done');
  });
});
