import { ConversationHistory, plan } from '@/ai-model';
import { parseXMLPlanningResponse } from '@/ai-model/llm-planning';
import { safeParseJson } from '@/ai-model/service-caller';
import { globalModelConfigManager } from '@midscene/shared/env';
import { mockActionSpace } from 'tests/common';
import { getContextFromFixture } from 'tests/evaluation';
import { describe, expect, it, vi } from 'vitest';

vi.setConfig({
  testTimeout: 180 * 1000,
  hookTimeout: 30 * 1000,
});

const modelConfig = globalModelConfigManager.getModelConfig('default');

// Regression test for https://github.com/web-infra-dev/midscene/issues/2049
//
// Real-world rawResponse from qwen3.5-flash on Android number pad:
//   "prompt": "数字键盘上的 "1" 按钮"
// The unescaped inner double quotes break JSON parsing.
// Fix: prompt examples use backticks so the LLM outputs `1` instead of "1".

// The exact rawResponse from issue #2049
const issueRawResponse = [
  '<thought>用户要求输入 "10" 并点击确认。当前页面显示数字键盘，',
  '我需要先点击数字 "1"，然后点击 "0"，最后点击 "OK" 按钮。',
  '首先点击数字 "1"。</thought>',
  '<log>点击数字键盘上的 "1"</log>',
  '<action-type>Tap</action-type>',
  '<action-param-json>',
  '{',
  '  "locate": {',
  '    "prompt": "数字键盘上的 "1" 按钮",',
  '    "bbox": [100, 765, 200, 805]',
  '  }',
  '}',
  '</action-param-json>',
].join('\n');

// The fixed version: backticks instead of double quotes
const fixedRawResponse = issueRawResponse
  .replace(/"1"/g, '`1`')
  .replace(/"10"/g, '`10`')
  .replace(/"0"/g, '`0`')
  .replace(/"OK"/g, '`OK`');

describe('planning - quoted text in instruction (#2049)', () => {
  describe('reproduce: exact rawResponse from issue #2049', () => {
    it('parseXMLPlanningResponse should fail on the issue rawResponse', () => {
      expect(() => {
        parseXMLPlanningResponse(issueRawResponse, undefined);
      }).toThrow('Failed to parse action-param-json');
    });

    it('safeParseJson should fail on the broken JSON', () => {
      const brokenJson =
        '{"locate": {"prompt": "数字键盘上的 "1" 按钮", "bbox": [100, 765, 200, 805]}}';

      expect(() => {
        safeParseJson(brokenJson, undefined);
      }).toThrow();
    });
  });

  describe('fix: backtick version of the same response parses correctly', () => {
    it('parseXMLPlanningResponse should succeed with backticks', () => {
      const result = parseXMLPlanningResponse(fixedRawResponse, undefined);

      expect(result.action).toBeTruthy();
      expect(result.action.type).toBe('Tap');
      expect(result.action.param.locate.prompt).toContain('`1`');
      expect(result.action.param.locate.bbox).toEqual([100, 765, 200, 805]);
    });
  });

  describe('e2e: LLM produces valid JSON for instructions with quoted text', () => {
    it('numpad: click "1" should not produce broken JSON', async () => {
      const { context } = await getContextFromFixture('numpad');

      const result = await plan('点击数字键盘上的 "1"', {
        context,
        actionSpace: mockActionSpace,
        interfaceType: 'puppeteer',
        modelConfig,
        conversationHistory: new ConversationHistory(),
        includeBbox: true,
      });

      expect(result).toBeTruthy();
      expect(result.rawResponse).toBeTruthy();

      const paramMatch = result.rawResponse!.match(
        /<action-param-json>([\s\S]*?)<\/action-param-json>/,
      );
      expect(paramMatch).toBeTruthy();

      const paramJson = paramMatch![1].trim();
      console.log('numpad action-param-json:', paramJson);
      expect(() => JSON.parse(paramJson)).not.toThrow();

      const prompt = result.actions?.[0]?.param?.locate?.prompt ?? '';
      console.log('numpad locate prompt:', prompt);
    });

    it('todo: click "Active" should not produce broken JSON', async () => {
      const { context } = await getContextFromFixture('todo');

      const result = await plan('点击 "Active" 按钮', {
        context,
        actionSpace: mockActionSpace,
        interfaceType: 'puppeteer',
        modelConfig,
        conversationHistory: new ConversationHistory(),
        includeBbox: true,
      });

      expect(result).toBeTruthy();
      expect(result.rawResponse).toBeTruthy();

      const paramMatch = result.rawResponse!.match(
        /<action-param-json>([\s\S]*?)<\/action-param-json>/,
      );
      expect(paramMatch).toBeTruthy();

      const paramJson = paramMatch![1].trim();
      console.log('todo action-param-json:', paramJson);
      expect(() => JSON.parse(paramJson)).not.toThrow();

      const prompt = result.actions?.[0]?.param?.locate?.prompt ?? '';
      console.log('todo locate prompt:', prompt);
    });
  });
});
