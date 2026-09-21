import { readFileSync } from 'node:fs';
import { describe, expect, it } from '@rstest/core';
import {
  agentOptionsToFormValues,
  parseAgentOptionFormValues,
} from '../src/component/config-modal';

const configModalComponent = readFileSync(
  new URL('../src/component/config-modal/index.tsx', import.meta.url),
  'utf8',
);
const configModalStyles = readFileSync(
  new URL('../src/component/config-modal/index.less', import.meta.url),
  'utf8',
);

describe('ConfigModal Agent options', () => {
  it('renders persisted options as editable values', () => {
    expect(
      agentOptionsToFormValues({
        replanningCycleLimit: 20,
        screenshotShrinkFactor: 2,
        waitAfterAction: 500,
      }),
    ).toEqual({
      replanningCycleLimit: '20',
      screenshotShrinkFactor: '2',
      waitAfterAction: '500',
    });
  });

  it('omits blank fields and parses valid values', () => {
    expect(
      parseAgentOptionFormValues({
        replanningCycleLimit: '0',
        screenshotShrinkFactor: '2.5',
        waitAfterAction: '',
      }),
    ).toEqual({
      error: null,
      options: {
        replanningCycleLimit: 0,
        screenshotShrinkFactor: 2.5,
      },
    });
  });

  it('rejects values outside the supported ranges', () => {
    expect(
      parseAgentOptionFormValues({
        replanningCycleLimit: '-1',
        screenshotShrinkFactor: '1',
        waitAfterAction: '300',
      }),
    ).toMatchObject({ options: null });
    expect(
      parseAgentOptionFormValues({
        replanningCycleLimit: '12',
        screenshotShrinkFactor: '0.5',
        waitAfterAction: '-1',
      }),
    ).toMatchObject({ options: null });
  });

  it('keeps model environment entries horizontally scrollable', () => {
    expect(configModalComponent).toContain('wrap="off"');
    expect(configModalComponent).not.toContain('wrap="soft"');
    expect(configModalStyles).toContain('overflow-x: auto;');
    expect(configModalStyles).toContain('white-space: pre;');
    expect(configModalStyles).toContain('scrollbar-color:');
    expect(configModalStyles).toMatch(
      /&::\-webkit-scrollbar\s*\{\s*width: 6px;\s*height: 6px;/,
    );
    expect(configModalStyles).toMatch(
      /&::\-webkit-scrollbar-thumb\s*\{\s*border-radius: 999px;\s*background: var\(--midscene-border-control, rgba\(0, 0, 0, 0\.25\)\);/,
    );
  });

  it('keeps verification failures compact on their own row', () => {
    expect(configModalComponent).not.toContain('Verify and Save Model');
    expect(configModalComponent).toContain("'Verifying' : 'Verify'");
    expect(configModalComponent).toContain('message="Verified"');
    expect(configModalComponent).not.toContain('Test passed.');
    expect(configModalStyles).toContain(
      'grid-template-columns: minmax(0, 1fr) auto;',
    );
    expect(configModalComponent).toContain(
      "statusError ? ' midscene-config-modal-verify-row--error' : ''",
    );
    expect(configModalStyles).toMatch(
      /&--error\s*\{\s*grid-template-columns: minmax\(0, 1fr\);/,
    );
    expect(configModalStyles).toMatch(
      /\.midscene-config-modal-verify-button\s*\{\s*justify-self: end;/,
    );
    expect(configModalStyles).toContain('align-items: center;');
    expect(configModalStyles).toContain('padding-block: 4px;');
    expect(configModalStyles).toContain('max-height: 96px;');
    expect(configModalStyles).toMatch(
      /&\.ant-alert-error\s*\{\s*align-items: flex-start;/,
    );
    expect(configModalStyles).toMatch(
      /\.ant-alert-icon\s*\{\s*margin-top: 4px;/,
    );
    expect(configModalStyles).toMatch(
      /&\.ant-alert-success\s*\{\s*width: fit-content;\s*justify-self: start;/,
    );
    expect(configModalStyles).toContain('overflow-wrap: anywhere;');
    expect(configModalStyles).toContain('padding-inline: 12px;');
  });

  it('relies on Ant Design theme tokens instead of component dark overrides', () => {
    expect(configModalStyles).not.toContain("[data-theme='dark']");
    expect(configModalStyles).not.toContain('!important');
    expect(configModalStyles).not.toContain('.ant-modal-content');
    expect(configModalComponent).toContain(
      '<strong>locally in your browser</strong>',
    );
  });
});
