import { PuppeteerAgent } from '@/puppeteer';
import { describe, expect, it } from '@rstest/core';
import {
  DEFAULT_TEST_TIMEOUT,
  createTestContext,
  getFixturePath,
} from './test-utils';
import { launchPage } from './utils';

describe(
  'puppeteer integration - disabled & custom attributes',
  () => {
    const ctx = createTestContext();

    it('should recognize disabled elements via DOM query', async () => {
      const htmlPath = getFixturePath('disabled-attrs.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage);

      // Query: which input fields and buttons are disabled?
      const disabledElements = await ctx.agent.aiQuery(
        '{name: string, type: string, isDisabled: boolean}[], list all input fields and buttons, include their name/label, type, and whether they are disabled',
        { domIncluded: true },
      );

      console.log(
        'disabledElements',
        JSON.stringify(disabledElements, null, 2),
      );

      expect(disabledElements.length).toBeGreaterThanOrEqual(4);

      // Username input should be disabled
      const usernameItem = disabledElements.find((e: any) =>
        e.name?.toLowerCase().includes('username'),
      );
      expect(usernameItem).toBeDefined();
      expect(usernameItem.isDisabled).toBe(true);

      // Submit button should be disabled
      const submitItem = disabledElements.find((e: any) =>
        e.name?.toLowerCase().includes('submit'),
      );
      expect(submitItem).toBeDefined();
      expect(submitItem.isDisabled).toBe(true);

      // Cancel button should NOT be disabled
      const cancelItem = disabledElements.find((e: any) =>
        e.name?.toLowerCase().includes('cancel'),
      );
      expect(cancelItem).toBeDefined();
      expect(cancelItem.isDisabled).toBe(false);
    });

    it('should recognize custom data attributes without value', async () => {
      const htmlPath = getFixturePath('disabled-attrs.html');
      const { originPage, reset } = await launchPage(`file://${htmlPath}`);
      ctx.resetFn = reset;
      ctx.agent = new PuppeteerAgent(originPage);

      // Query: what tags are there and what data attributes do they have?
      const tags = await ctx.agent.aiQuery(
        '{text: string, hasDataFlag: boolean, hasDataActive: boolean, hasDataArchived: boolean}[], list all the tag elements, include their text and whether they have data-flag, data-active, data-archived attributes',
        { domIncluded: true },
      );

      console.log('tags', JSON.stringify(tags, null, 2));

      expect(tags.length).toBe(3);

      const importantTag = tags.find((t: any) =>
        t.text?.toLowerCase().includes('important'),
      );
      expect(importantTag).toBeDefined();
      expect(importantTag.hasDataFlag).toBe(true);

      const activeTag = tags.find((t: any) =>
        t.text?.toLowerCase().includes('active'),
      );
      expect(activeTag).toBeDefined();
      expect(activeTag.hasDataActive).toBe(true);

      const archivedTag = tags.find((t: any) =>
        t.text?.toLowerCase().includes('archived'),
      );
      expect(archivedTag).toBeDefined();
      expect(archivedTag.hasDataArchived).toBe(true);
    });
  },
  DEFAULT_TEST_TIMEOUT,
);
