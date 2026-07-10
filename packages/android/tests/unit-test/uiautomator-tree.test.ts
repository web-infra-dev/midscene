import {
  evaluateXpath,
  generateXpathCandidates,
} from '@midscene/core/device-cache';
import { describe, expect, it } from 'vitest';
import { uiautomatorXmlToUiNode } from '../../src/uiautomator-tree';

const SAMPLE_UIAUTOMATOR_DUMP = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="com.example.app" content-desc="" enabled="true" bounds="[0,0][1080,2400]">
    <node index="0" text="" resource-id="com.example.app:id/root" class="android.widget.LinearLayout" package="com.example.app" content-desc="" enabled="true" bounds="[0,0][1080,2400]">
      <node index="0" text="账号" resource-id="com.example.app:id/username_label" class="android.widget.TextView" package="com.example.app" content-desc="" enabled="true" bounds="[40,200][200,260]"/>
      <node index="1" text="" resource-id="com.example.app:id/username_input" class="android.widget.EditText" package="com.example.app" content-desc="请输入账号" enabled="true" bounds="[40,280][1040,400]"/>
      <node index="2" text="登录" resource-id="com.example.app:id/login_btn" class="android.widget.Button" package="com.example.app" content-desc="登录按钮" enabled="true" clickable="true" bounds="[40,500][1040,640]"/>
    </node>
  </node>
</hierarchy>`;

describe('uiautomatorXmlToUiNode', () => {
  it('parses bounds and divides by DPR for logical coords', () => {
    const root = uiautomatorXmlToUiNode(SAMPLE_UIAUTOMATOR_DUMP, 2);
    // physical [0,0][1080,2400] / DPR 2 -> logical 540 x 1200
    expect(root.bounds).toEqual({
      left: 0,
      top: 0,
      width: 540,
      height: 1200,
    });
  });

  it('uses the class attribute as the type, drops the bounds attr', () => {
    const root = uiautomatorXmlToUiNode(SAMPLE_UIAUTOMATOR_DUMP, 2);
    expect(root.type).toBe('android.widget.FrameLayout');
    expect(root.attrs.bounds).toBeUndefined();
    expect(root.attrs['resource-id']).toBe('');
    expect(root.attrs.class).toBe('android.widget.FrameLayout');
  });

  it('emits resource-id selector for the deepest hit', () => {
    const root = uiautomatorXmlToUiNode(SAMPLE_UIAUTOMATOR_DUMP, 2);
    // tap center of login_btn -> physical (540, 570) / 2 = logical (270, 285)
    const xpaths = generateXpathCandidates(
      root,
      { x: 270, y: 285 },
      {
        stableAttrs: ['resource-id'],
        textAttrs: ['text', 'content-desc'],
      },
    );
    expect(xpaths[0]).toBe("//*[@resource-id='com.example.app:id/login_btn']");
    for (const xp of xpaths) {
      const matches = evaluateXpath(root, xp);
      expect(matches).toHaveLength(1);
      expect(matches[0].attrs['resource-id']).toBe(
        'com.example.app:id/login_btn',
      );
    }
  });

  it('falls back to text when resource-id is empty but text is set', () => {
    const noIdDump = `<?xml version='1.0'?>
<hierarchy>
  <node class="android.widget.FrameLayout" bounds="[0,0][1000,2000]">
    <node text="登录" resource-id="" class="android.widget.Button" content-desc="" bounds="[100,500][900,640]"/>
  </node>
</hierarchy>`;
    const root = uiautomatorXmlToUiNode(noIdDump, 1);
    const xpaths = generateXpathCandidates(
      root,
      { x: 500, y: 570 },
      {
        stableAttrs: ['resource-id'],
        textAttrs: ['text', 'content-desc'],
      },
    );
    expect(xpaths[0]).toBe("//android.widget.Button[@text='登录']");
  });

  it('falls back to content-desc when text is empty', () => {
    const onlyDescDump = `<?xml version='1.0'?>
<hierarchy>
  <node class="android.widget.FrameLayout" bounds="[0,0][1000,2000]">
    <node text="" resource-id="" class="android.widget.ImageButton" content-desc="返回" bounds="[20,40][100,120]"/>
  </node>
</hierarchy>`;
    const root = uiautomatorXmlToUiNode(onlyDescDump, 1);
    const xpaths = generateXpathCandidates(
      root,
      { x: 60, y: 80 },
      {
        stableAttrs: ['resource-id'],
        textAttrs: ['text', 'content-desc'],
      },
    );
    expect(xpaths[0]).toBe(
      "//android.widget.ImageButton[@content-desc='返回']",
    );
  });

  it('survives missing or malformed bounds attribute', () => {
    const dump = `<?xml version='1.0'?>
<hierarchy>
  <node class="X" bounds="garbage"/>
</hierarchy>`;
    const root = uiautomatorXmlToUiNode(dump, 1);
    expect(root.bounds).toEqual({ left: 0, top: 0, width: 0, height: 0 });
  });

  it('preserves the hierarchy root when there are multiple top-level nodes', () => {
    const multi = `<?xml version='1.0'?>
<hierarchy>
  <node class="A" resource-id="a" bounds="[0,0][100,100]"/>
  <node class="B" resource-id="b" bounds="[100,0][200,100]"/>
</hierarchy>`;
    const root = uiautomatorXmlToUiNode(multi, 1);
    expect(root.type).toBe('hierarchy');
    expect(root.children).toHaveLength(2);

    const xpaths = generateXpathCandidates(
      root,
      { x: 150, y: 50 },
      { stableAttrs: ['resource-id'] },
    );
    expect(xpaths).toContain("//*[@resource-id='b']");
  });
});
