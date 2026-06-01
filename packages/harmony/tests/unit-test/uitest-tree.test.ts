import {
  evaluateXpath,
  generateXpathCandidates,
} from '@midscene/core/device-cache';
import { describe, expect, it } from 'vitest';
import { uitestJsonToUiNode } from '../../src/uitest-tree';

const SAMPLE_DUMP_LAYOUT = JSON.stringify({
  attributes: {
    type: 'RootDecor',
    bounds: '[0,0][1260,2720]',
    accessibilityId: '0',
  },
  children: [
    {
      attributes: {
        type: 'Stack',
        bounds: '[0,0][1260,2720]',
        accessibilityId: '1',
      },
      children: [
        {
          attributes: {
            type: 'TextInput',
            key: 'username_input',
            description: '请输入账号',
            bounds: '[40,300][1220,420]',
          },
          children: [],
        },
        {
          attributes: {
            type: 'Button',
            key: 'login_btn',
            text: '登录',
            description: '登录按钮',
            bounds: '[40,500][1220,640]',
          },
          children: [],
        },
      ],
    },
  ],
});

describe('uitestJsonToUiNode', () => {
  it('parses bounds in [x1,y1][x2,y2] form, scale defaults to 1', () => {
    const root = uitestJsonToUiNode(SAMPLE_DUMP_LAYOUT);
    expect(root.bounds).toEqual({
      left: 0,
      top: 0,
      width: 1260,
      height: 2720,
    });
  });

  it('uses attributes.type as the UiNode type', () => {
    const root = uitestJsonToUiNode(SAMPLE_DUMP_LAYOUT);
    expect(root.type).toBe('RootDecor');
    expect(root.children[0].type).toBe('Stack');
    expect(root.children[0].children[1].type).toBe('Button');
  });

  it('emits inspectorKey selector for the deepest hit', () => {
    const root = uitestJsonToUiNode(SAMPLE_DUMP_LAYOUT);
    const xpaths = generateXpathCandidates(
      root,
      { x: 630, y: 570 },
      {
        stableAttrs: ['key', 'id', 'inspectorKey'],
        textAttrs: ['text', 'description', 'accessibilityText'],
      },
    );
    expect(xpaths[0]).toBe("//*[@key='login_btn']");
    for (const xp of xpaths) {
      const matches = evaluateXpath(root, xp);
      expect(matches).toHaveLength(1);
      expect(matches[0].attrs.key).toBe('login_btn');
    }
  });

  it('falls back to text when key is missing', () => {
    const dump = JSON.stringify({
      attributes: { type: 'Stack', bounds: '[0,0][1000,2000]' },
      children: [
        {
          attributes: {
            type: 'Button',
            text: '注册',
            bounds: '[100,500][900,640]',
          },
          children: [],
        },
      ],
    });
    const root = uitestJsonToUiNode(dump);
    const xpaths = generateXpathCandidates(
      root,
      { x: 500, y: 570 },
      {
        stableAttrs: ['key', 'id', 'inspectorKey'],
        textAttrs: ['text', 'description'],
      },
    );
    expect(xpaths[0]).toBe("//Button[@text='注册']");
  });

  it('accepts structured rect form as an alternative to the bracket bounds', () => {
    const dump = JSON.stringify({
      attributes: {
        type: 'Stack',
        rect: { left: 0, top: 0, right: 1000, bottom: 2000 },
      },
      children: [
        {
          attributes: {
            type: 'Button',
            key: 'k',
            rect: { left: 100, top: 500, right: 900, bottom: 640 },
          },
          children: [],
        },
      ],
    });
    const root = uitestJsonToUiNode(dump);
    expect(root.children[0].bounds).toEqual({
      left: 100,
      top: 500,
      width: 800,
      height: 140,
    });
  });

  it('throws on invalid JSON', () => {
    expect(() => uitestJsonToUiNode('{not json')).toThrow();
  });

  it('survives missing attributes / children fields', () => {
    const root = uitestJsonToUiNode('{}');
    expect(root.type).toBe('unknown');
    expect(root.children).toEqual([]);
  });

  it('honors a custom scale factor', () => {
    const dump = JSON.stringify({
      attributes: { type: 'Stack', bounds: '[0,0][1000,2000]' },
    });
    const root = uitestJsonToUiNode(dump, 2);
    expect(root.bounds).toEqual({
      left: 0,
      top: 0,
      width: 500,
      height: 1000,
    });
  });
});
