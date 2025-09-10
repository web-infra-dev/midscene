import { treeToList } from '@midscene/shared/extractor';
import { getContextFromFixture } from 'tests/evaluation';
import { describe, expect, it, vi } from 'vitest';

import fs from 'node:fs';
import path from 'node:path';
import {
  describeUserPage,
  elementByPositionWithElementInfo,
} from '@/ai-model/prompt/util';
import type { GroupedActionDump } from '@/types';
import type { TVlModeTypes } from '@midscene/shared/env';

describe('prompt utils - describeUserPage', () => {
  let lengthOfDescription: number;

  const vlMode: TVlModeTypes = 'qwen-vl';

  it('describe context ', { timeout: 10000 }, async () => {
    const context = await getContextFromFixture('taobao', {
      vlMode,
    });
    const { description } = await describeUserPage(context.context, {
      domIncluded: true,
      visibleOnly: false,
      vlMode,
    });

    lengthOfDescription = description.length;
    const stringLengthOfEachItem =
      lengthOfDescription / treeToList(context.context.tree).length;
    expect(description).toBeTruthy();
    expect(stringLengthOfEachItem).toBeLessThan(250);
  });

  it('describe context, truncateTextLength = 100, filterNonTextContent = true', async () => {
    const context = await getContextFromFixture('taobao', {
      vlMode,
    });

    const { description } = await describeUserPage(context.context, {
      truncateTextLength: 100,
      filterNonTextContent: true,
      domIncluded: true,
      visibleOnly: false,
      vlMode,
    });

    const stringLengthOfEachItem =
      description.length / treeToList(context.context.tree).length;
    expect(description).toBeTruthy();
    expect(stringLengthOfEachItem).toBeLessThan(160);
    expect(description.length).toBeLessThan(lengthOfDescription * 0.8);
  });

  it('describe context, domIncluded = "visible-only"', async () => {
    const context = await getContextFromFixture('taobao', {
      vlMode,
    });

    const { description } = await describeUserPage(context.context, {
      filterNonTextContent: true,
      domIncluded: 'visible-only',
      vlMode,
    });

    expect(description).toBeTruthy();
    expect(description.length).toBeLessThan(
      treeToList(context.context.tree).length,
    );
  });

  it('describe context with non-vl mode', async () => {
    const context = await getContextFromFixture('taobao', {
      vlMode: undefined,
    });
    const { description } = await describeUserPage(context.context, {
      domIncluded: false,
      vlMode: undefined,
    });

    // In non-vl mode, description should include page elements even when domIncluded is false
    expect(description).toBeTruthy();
  });

  it('describe context with vl mode', async () => {
    const context = await getContextFromFixture('taobao', {
      vlMode,
    });
    const { description } = await describeUserPage(context.context, {
      domIncluded: false,
      vlMode,
    });

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
