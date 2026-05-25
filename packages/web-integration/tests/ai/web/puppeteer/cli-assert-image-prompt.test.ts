import path from 'node:path';
import { PuppeteerAgent } from '@/puppeteer';
import { generateCommonTools } from '@midscene/shared/mcp/tool-generator';
import type { BaseAgent, ToolDefinition } from '@midscene/shared/mcp/types';
import { describe, expect, it } from 'vitest';
import { createTestContext } from './test-utils';
import { launchPage } from './utils';

const GITHUB_LOGO_FIXTURE = path.resolve(
  __dirname,
  '../../fixtures/github-logo.png',
);

/**
 * Exercise the CLI / MCP `assert` tool exposed by `generateCommonTools`
 * with multimodal image params. This proves the CLI handler path
 * (`npx @midscene/* assert --prompt … --image … --image-name …`) forwards the image
 * reference all the way to `agent.aiAssert` and the real model call
 * succeeds, mirroring the SDK-level test in `playwright/image-prompt.spec.ts`.
 */
describe(
  'CLI assert tool with image prompts',
  () => {
    const ctx = createTestContext();

    function buildAssertTool(agent: PuppeteerAgent): ToolDefinition {
      const tool = generateCommonTools(
        async () => agent as unknown as BaseAgent,
      ).find((t) => t.name === 'assert');
      if (!tool) {
        throw new Error('assert tool not registered by generateCommonTools');
      }
      return tool;
    }

    it('passes a local image path through the CLI handler to aiAssert', async () => {
      const { originPage, reset } = await launchPage('about:blank');
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage);

      const assertTool = buildAssertTool(ctx.agent);

      // about:blank does not contain a logo, so an assertion that there is
      // NO logo should pass even though we attach a reference image.
      const result = await assertTool.handler({
        prompt: 'There is no github logo on the current screen.',
        image: GITHUB_LOGO_FIXTURE,
        imageName: 'github-logo',
      });

      expect(result.isError).toBeFalsy();
      expect(result.content?.[0]).toMatchObject({
        type: 'text',
        text: 'Assertion passed.',
      });
    });

    it('accepts repeated image/image-name args (matches CLI argv parsing)', async () => {
      const { originPage, reset } = await launchPage('about:blank');
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage);

      const assertTool = buildAssertTool(ctx.agent);

      // Repeated CLI flags are accumulated as arrays by parseCliArgs. Simulate
      // that parsed argv shape here to match the actual command path.
      const result = await assertTool.handler({
        prompt: 'There is no github logo on the current screen.',
        image: [GITHUB_LOGO_FIXTURE],
        imageName: ['github-logo'],
      });

      expect(result.isError).toBeFalsy();
      expect(result.content?.[0]).toMatchObject({
        type: 'text',
        text: 'Assertion passed.',
      });
    });

    it('surfaces assertion failures through isError without throwing', async () => {
      const { originPage, reset } = await launchPage('about:blank');
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage);

      const assertTool = buildAssertTool(ctx.agent);

      // Inverse claim: a blank page does NOT contain the reference logo,
      // so asserting that it does should fail. The handler must return
      // `isError: true` rather than throwing, matching the CLI contract.
      const result = await assertTool.handler({
        prompt: 'There is a github logo on the current screen.',
        image: GITHUB_LOGO_FIXTURE,
        imageName: 'github-logo',
      });

      expect(result.isError).toBe(true);
    });
  },
  {
    // AI calls are slow; keep these inside the project's standard AI budget.
    timeout: 3 * 60 * 1000,
  },
);
