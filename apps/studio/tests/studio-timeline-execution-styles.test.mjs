import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const timelineStyles = readFileSync(
  new URL(
    '../src/renderer/components/Playground/StudioTimelineExecution.css',
    import.meta.url,
  ),
  'utf8',
);

describe('Studio execution timeline styles', () => {
  it('matches the Figma 16px rail and compact step geometry', () => {
    expect(timelineStyles).toContain('padding: 5.846px 16px 20px;');
    expect(timelineStyles).toContain('gap: 0;');
    expect(timelineStyles).toContain('display: grid;');
    expect(timelineStyles).toContain(
      'grid-template-columns: 16px minmax(0, 1fr);',
    );
    expect(timelineStyles).toContain('column-gap: 8px;');
    expect(timelineStyles).toContain('display: contents;');
    expect(timelineStyles).toContain('padding: 8px;');
    expect(timelineStyles).toContain('margin-top: 11px;');
    expect(timelineStyles).toContain('top: 30px;');
    expect(timelineStyles).toContain('bottom: 0;');
    expect(timelineStyles).toContain('background: #d9d9d9;');
    expect(timelineStyles).toContain('[data-theme="dark"]');
    expect(timelineStyles).toContain('background: #444;');
    expect(timelineStyles).toContain('display: none !important;');
    expect(timelineStyles).toContain('.progress-row-last');
    expect(timelineStyles).toContain('color: #188f4d;');
    expect(timelineStyles).toContain(
      '.playground-container.playground-conversation-skin\n  .studio-execution-timeline-skin',
    );
  });

  it('keeps the 20px gap between a progress group and other timeline items', () => {
    expect(timelineStyles).toContain('margin-top: 20px;');
  });

  it('separates a subsequent execution prompt from the previous result', () => {
    const resultToPromptSelector =
      /\.list-item:has\(\.system-message-container\)\s*\+ \.list-item:has\(\.user-message-container\)/g;
    expect(timelineStyles.match(resultToPromptSelector)).toHaveLength(2);
  });

  it('uses the same two-line clamp for Replay and Playground timelines', () => {
    expect(timelineStyles).toContain('-webkit-line-clamp: 2;');
    expect(timelineStyles).toContain('text-overflow: ellipsis;');
  });

  it('keeps Figma event names medium and descriptions regular', () => {
    expect(timelineStyles).toContain('font-weight: 500 !important;');
    expect(timelineStyles).toContain('font-weight: 400 !important;');
  });

  it('uses 13px Inter medium text for alerts and conversation bubbles', () => {
    expect(timelineStyles).toContain('.ant-alert-message');
    expect(timelineStyles).toContain('.user-message-bubble');
    expect(timelineStyles).toContain('font-family: Inter, system-ui');
    expect(timelineStyles).toContain('font-size: 13px;');
    expect(timelineStyles).toContain('font-weight: 500;');
  });

  it('keeps active descriptions neutral in dark mode', () => {
    expect(timelineStyles).toContain('background: none;');
    expect(timelineStyles).toContain('background-image: none !important;');
    expect(timelineStyles).toContain('color: rgba(255, 255, 255, 0.9);');
  });
});
