import { describe, expect, it } from 'vitest';
import type { MidsceneRecorderEvent } from '../../src/recorder';
import {
  getMidsceneRecorderEventDescription,
  getMidsceneRecorderScreenshotsForLLM,
  sanitizeMidsceneRecorderFileName,
  stringifyMidsceneRecorderTargetBlock,
} from '../../src/recorder';

describe('recorder shared schema helpers', () => {
  it('accepts recorder events from web, studio preview, and computer native sources', () => {
    const events: MidsceneRecorderEvent[] = [
      {
        type: 'click',
        source: 'web-dom',
        pageInfo: { width: 1280, height: 720 },
        timestamp: 1,
        hashId: 'web-click',
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
        source: 'computer-native',
        value: '0,-285',
        pageInfo: { width: 1728, height: 1117 },
        timestamp: 3,
        hashId: 'computer-scroll',
      },
    ];

    expect(events.map((event) => event.source)).toEqual([
      'web-dom',
      'studio-preview',
      'computer-native',
    ]);
  });

  it('derives event descriptions with semantic and coordinate fallbacks', () => {
    expect(
      getMidsceneRecorderEventDescription({
        type: 'click',
        actionType: 'Click',
        elementDescription: 'Submit button',
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

  it('selects screenshots by event priority and removes duplicates', () => {
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
    ).toEqual(['nav-shot', 'click-box', 'scroll-shot']);
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
});
