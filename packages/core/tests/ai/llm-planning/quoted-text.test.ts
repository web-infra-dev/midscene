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
describe('planning - quoted text in instruction (#2049)', () => {
  // Unit test: deterministically reproduce the parse failure
  describe('reproduce: unescaped quotes break JSON parsing', () => {
    it('should fail when LLM uses unescaped quotes in JSON string values', () => {
      // This is the exact broken pattern from #2049:
      // LLM wraps element names with double quotes inside a JSON string value
      const brokenResponse = `
<thought>I need to tap the "1" button on the number pad</thought>
<log>点击数字键盘上的 "1" 按钮</log>
<action-type>Tap</action-type>
<action-param-json>
{
  "locate": {
    "prompt": "数字键盘上的 "1" 按钮",
    "bbox": [100, 200, 150, 230]
  }
}
</action-param-json>`;

      expect(() => {
        parseXMLPlanningResponse(brokenResponse, undefined);
      }).toThrow();
    });

    it('safeParseJson also fails on unescaped quotes that jsonrepair cannot fix', () => {
      // jsonrepair cannot fix this pattern: short quoted text like "1"
      // surrounded by other JSON keys
      const brokenJson =
        '{"locate": {"prompt": "数字键盘上的 "1" 按钮", "bbox": [100, 200, 150, 230]}}';

      expect(() => {
        safeParseJson(brokenJson, undefined);
      }).toThrow();
    });
  });

  // Unit test: verify backtick pattern works correctly
  describe('fix: backtick-wrapped text parses correctly', () => {
    it('should parse successfully when LLM uses backticks instead of quotes', () => {
      // After the prompt fix, LLM should use backticks for element names
      const goodResponse = `
<thought>I need to tap the \`1\` button on the number pad</thought>
<log>点击数字键盘上的 \`1\` 按钮</log>
<action-type>Tap</action-type>
<action-param-json>
{
  "locate": {
    "prompt": "数字键盘上的 \`1\` 按钮",
    "bbox": [100, 200, 150, 230]
  }
}
</action-param-json>`;

      const result = parseXMLPlanningResponse(goodResponse, undefined);
      expect(result.action).toBeTruthy();
      expect(result.action.type).toBe('Tap');
      expect(result.action.param.locate.prompt).toContain('`1`');
    });
  });

  // AI test: verify the LLM actually uses backticks in its response
  describe('e2e: LLM uses backticks for element names', () => {
    it('should use backticks in locate prompt when instruction contains quoted text', async () => {
      const { context } = await getContextFromFixture('todo');

      const result = await plan(
        '点击 "Active" 按钮',
        {
          context,
          actionSpace: mockActionSpace,
          interfaceType: 'puppeteer',
          modelConfig,
          conversationHistory: new ConversationHistory(),
          includeBbox: true,
        },
      );

      expect(result).toBeTruthy();
      expect(result.rawResponse).toBeTruthy();

      // Verify the LLM used backticks in its JSON response
      // Extract action-param-json from rawResponse
      const paramMatch = result.rawResponse!.match(
        /<action-param-json>([\s\S]*?)<\/action-param-json>/,
      );
      if (paramMatch) {
        const paramJson = paramMatch[1];
        // The JSON should NOT contain unescaped double quotes wrapping element names
        // It should use backticks like: "the `Active` button"
        console.log('action-param-json from LLM:', paramJson);

        // Verify it parses as valid JSON (no unescaped quote issue)
        expect(() => JSON.parse(paramJson)).not.toThrow();
      }

      // Verify locate prompt uses backticks for the element name
      const action = result.actions?.[0];
      if (action?.param?.locate?.prompt) {
        const prompt = action.param.locate.prompt;
        console.log('locate prompt from LLM:', prompt);
        expect(prompt).toContain('`');
      }
    });
  });
});
