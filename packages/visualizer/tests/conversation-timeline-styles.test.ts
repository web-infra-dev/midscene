import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(
  new URL('../src/component/universal-playground/index.less', import.meta.url),
  'utf8',
);
const playerStyles = readFileSync(
  new URL('../src/component/player/index.less', import.meta.url),
  'utf8',
);
const universalPlayground = readFileSync(
  new URL('../src/component/universal-playground/index.tsx', import.meta.url),
  'utf8',
);

describe('conversation timeline styles', () => {
  it('uses 13px text for every timeline message type', () => {
    const conversationSkin = styles.slice(
      styles.indexOf('.playground-container.playground-conversation-skin'),
      styles.indexOf('// Dark mode palette for the conversation skin.'),
    );

    expect(conversationSkin).toMatch(
      /\.user-message-container \.user-message-bubble\s*\{[\s\S]*?font-size: 13px;/,
    );
    expect(conversationSkin).toMatch(
      /\.progress-row-content \.ant-alert-message\s*\{[\s\S]*?font-size: 13px;/,
    );
    expect(conversationSkin).toMatch(
      /\.progress-action-item\s*\{[\s\S]*?font-size: 13px;/,
    );
    expect(conversationSkin).toMatch(
      /\.progress-description\s*\{[\s\S]*?font-size: 13px;/,
    );
    expect(conversationSkin).toMatch(
      /\.progress-action-item\s*\{[\s\S]*?font-weight: 500;/,
    );
    expect(conversationSkin).toMatch(
      /\.progress-description\s*\{[\s\S]*?font-weight: 400;/,
    );
    expect(conversationSkin).toMatch(
      /\.progress-group-toggle\s*\{[\s\S]*?font-size: 13px;/,
    );
    expect(conversationSkin).toContain(
      '.system-message-header .system-message-title,',
    );
    expect(conversationSkin).toContain(
      '.system-message-content .error-message,',
    );
  });

  it('uses the Player timeline presentation for reports', () => {
    expect(universalPlayground).toContain('playerPresentation="timeline"');
    expect(playerStyles).toContain("&[data-presentation='timeline']");
    expect(playerStyles).toContain('height: 260px;');
    expect(playerStyles).toContain('min-height: 0;');
    expect(playerStyles).toContain('border: 0;');
  });

  it('uses the recorder-style Ant Design tooltip for truncated progress rows', () => {
    expect(universalPlayground).toContain(
      "import { Alert, Button, Form, List, Tooltip } from 'antd';",
    );
    expect(universalPlayground).toContain(
      'return truncated ? <Tooltip title={content}>{copy}</Tooltip> : copy;',
    );
    expect(universalPlayground).not.toContain(
      'title={truncated ? content : undefined}',
    );
    expect(styles).toMatch(
      /.progress-row-copy\s*\{[\s\S]*?display:\s*-webkit-box;[\s\S]*?max-height:\s*48px;[\s\S]*?-webkit-line-clamp:\s*2;/,
    );
  });

  it('keeps the prompt composer and timeline as separate layout regions', () => {
    expect(universalPlayground).toContain(
      '<div className="playground-timeline-region">',
    );
    expect(universalPlayground).toContain('const promptInputSection =');
    expect(universalPlayground).toContain(
      "componentConfig.promptInputPlacement === 'before-timeline'",
    );
    expect(universalPlayground).toContain(
      '{renderPromptBeforeTimeline ? promptInputSection : null}',
    );
    expect(styles).toMatch(
      /\.playground-timeline-region\s*\{[\s\S]*?flex:\s*1\s+1\s+auto;/,
    );
  });
});
