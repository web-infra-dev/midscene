import { treeToList } from '@midscene/shared/extractor';
import { getContextFromFixture } from 'tests/evaluation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the env module before importing the function that uses it
vi.mock('@midscene/shared/env', () => ({
  vlLocateMode: vi.fn(() => 'qwen-vl' as const), // default to 'qwen-vl'
}));

import fs from 'node:fs';
import path from 'node:path';
import {
  describeUserPage,
  elementByPositionWithElementInfo,
} from '@/ai-model/prompt/util';
import type { GroupedActionDump } from '@/types';
import { vlLocateMode } from '@midscene/shared/env';

describe('prompt utils - describeUserPage', () => {
  let lengthOfDescription: number;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Reset to default value
    vi.mocked(vlLocateMode).mockReturnValue('qwen-vl');
  });

  it(
    'describe context ',
    async () => {
      const context = await getContextFromFixture('taobao');
      const { description } = await describeUserPage(
        context.context,
        { intent: 'default' },
        {
          domIncluded: true,
          visibleOnly: false,
        },
      );

      lengthOfDescription = description.length;
      const stringLengthOfEachItem =
        lengthOfDescription / treeToList(context.context.tree).length;
      expect(description).toBeTruthy();
      expect(stringLengthOfEachItem).toBeLessThan(250);
    },
    { timeout: 10000 },
  );

  it('describe context, truncateTextLength = 100, filterNonTextContent = true', async () => {
    const context = await getContextFromFixture('taobao');

    const { description } = await describeUserPage(
      context.context,
      { intent: 'default' },
      {
        truncateTextLength: 100,
        filterNonTextContent: true,
        domIncluded: true,
        visibleOnly: false,
      },
    );

    const stringLengthOfEachItem =
      description.length / treeToList(context.context.tree).length;
    expect(description).toBeTruthy();
    expect(stringLengthOfEachItem).toBeLessThan(160);
    expect(description.length).toBeLessThan(lengthOfDescription * 0.8);
  });

  it('describe context, domIncluded = "visible-only"', async () => {
    const context = await getContextFromFixture('taobao');

    const { description } = await describeUserPage(
      context.context,
      { intent: 'default' },
      {
        filterNonTextContent: true,
        domIncluded: 'visible-only',
      },
    );

    expect(description).toBeTruthy();
    expect(description.length).toBeLessThan(
      treeToList(context.context.tree).length,
    );
  });

  it('describe context with non-vl mode', async () => {
    // Mock vlLocateMode to return false for this test
    vi.mocked(vlLocateMode).mockReturnValue(undefined);

    const context = await getContextFromFixture('taobao');
    const { description } = await describeUserPage(
      context.context,
      { intent: 'default' },
      {
        domIncluded: false,
      },
    );

    // In non-vl mode, description should include page elements even when domIncluded is false
    expect(description).toBeTruthy();
  });

  it('describe context with vl mode', async () => {
    // Mock vlLocateMode to return a VL mode for this test
    vi.mocked(vlLocateMode).mockReturnValue('qwen-vl');

    const context = await getContextFromFixture('taobao');
    const { description } = await describeUserPage(
      context.context,
      { intent: 'default' },
      {
        domIncluded: false,
      },
    );

    // In vl mode, description should be empty if domIncluded is false
    expect(description).toBeFalsy();
  });
});

describe('prompt utils - elementByPositionWithElementInfo', () => {
  it('should return the correct element at the position(filter invisible elements)', async () => {
    const dumpPath = path.join(
      __dirname,
      '../../',
      'fixtures',
      'dump-for-utils-test.json',
    );
    const dump = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
    const targetNode = {
      node: {
        content: '选好了',
        rect: {
          left: 138,
          top: 849,
          width: 247,
          height: 38,
          zoom: 1,
          isVisible: true,
        },
        center: [261, 868],
        id: 'hdocg',
        indexId: 263,
        attributes: {
          type: 'button',
          class: '.submit-btn.ant-btn.ant-btn-primary.ant-btn-lg.ant-btn-block',
          htmlTagName: '<button>',
          nodeType: 'BUTTON Node',
        },
        isVisible: true,
      },
      children: [],
    };
    const rectCenter = {
      x: targetNode.node.rect.left + targetNode.node.rect.width / 2,
      y: targetNode.node.rect.top + targetNode.node.rect.height / 2,
    };
    const element = elementByPositionWithElementInfo(
      dump.executions[0].tasks[0].uiContext.tree,
      rectCenter,
      {
        requireStrictDistance: false,
        filterPositionElements: true,
      },
    );

    expect(element?.id).toBe(targetNode.node.id);
  });

  it('should return the correct element at the position with filterPositionElements = false', async () => {
    const dumpPath = path.join(
      __dirname,
      '../../',
      'fixtures',
      'dump-for-utils-test.json',
    );
    const dump: GroupedActionDump = JSON.parse(
      fs.readFileSync(dumpPath, 'utf8'),
    );
    const targetNode = {
      node: {
        content: '选好了',
        rect: {
          left: 138,
          top: 849,
          width: 247,
          height: 38,
          zoom: 1,
          isVisible: true,
        },
        center: [261, 868],
        id: 'hdocg',
        indexId: 263,
        attributes: {
          type: 'button',
          class: '.submit-btn.ant-btn.ant-btn-primary.ant-btn-lg.ant-btn-block',
          htmlTagName: '<button>',
          nodeType: 'BUTTON Node',
        },
        isVisible: true,
      },
      children: [],
    };
    const rectCenter = {
      x: targetNode.node.rect.left + targetNode.node.rect.width / 2,
      y: targetNode.node.rect.top + targetNode.node.rect.height / 2,
    };
    const element = elementByPositionWithElementInfo(
      dump.executions[0].tasks[0].uiContext?.tree!,
      rectCenter,
      {
        requireStrictDistance: false,
        filterPositionElements: false,
      },
    );

    expect(element?.id).not.toBe(targetNode.node.id);
    expect(element?.attributes?.nodeType).toBe('POSITION Node');
  });

  it('should return correct element at the position when strictDistance is true', async () => {
    const dumpPath = path.join(
      __dirname,
      '../../',
      'fixtures',
      'dump-for-utils-test.json',
    );
    const dump = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
    const targetNode = {
      node: {
        content: '选好了',
        rect: {
          left: 138,
          top: 849,
          width: 247,
          height: 38,
          zoom: 1,
          isVisible: true,
        },
        center: [261, 868],
        id: 'hdocg',
        indexId: 263,
        attributes: {
          type: 'button',
          class: '.submit-btn.ant-btn.ant-btn-primary.ant-btn-lg.ant-btn-block',
          htmlTagName: '<button>',
          nodeType: 'BUTTON Node',
        },
        isVisible: true,
      },
      children: [],
    };
    const rectCenter = {
      x: targetNode.node.rect.left + targetNode.node.rect.width / 2,
      y: targetNode.node.rect.top + targetNode.node.rect.height / 2,
    };
    const element = elementByPositionWithElementInfo(
      dump.executions[0].tasks[0].uiContext?.tree,
      rectCenter,
      {
        requireStrictDistance: true,
        filterPositionElements: true,
      },
    );

    expect(element?.id).toBe(targetNode.node.id);
  });
});
