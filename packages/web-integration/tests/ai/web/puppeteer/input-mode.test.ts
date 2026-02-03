import { PuppeteerAgent } from '@/puppeteer';
import { describe, expect, it } from 'vitest';
import { launchPage } from './utils';

describe(
  'Input action mode tests',
  () => {
    it('typeOnly mode should not clear existing input content', async () => {
      const { originPage, reset } = await launchPage('about:blank');

      // Create a simple HTML page with an input field
      await originPage.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <input id="test-input" type="text" placeholder="Test input" style="width: 300px; padding: 10px; font-size: 16px;" />
          </body>
        </html>
      `);

      const agent = new PuppeteerAgent(originPage);

      try {
        // Step 1: Input first value (default replace mode)
        await agent.aiInput('Test input', { value: 'Hello' });

        // Get the value after first input
        const valueAfterFirstInput = await originPage.$eval(
          '#test-input',
          (el) => (el as HTMLInputElement).value,
        );
        console.log('Value after first input:', valueAfterFirstInput);
        expect(valueAfterFirstInput).toBe('Hello');

        // Step 2: Input second value with typeOnly mode (should append, not replace)
        await agent.aiInput('Test input', {
          value: ' World',
          mode: 'typeOnly',
        });

        // Get the value after second input
        const valueAfterSecondInput = await originPage.$eval(
          '#test-input',
          (el) => (el as HTMLInputElement).value,
        );
        console.log(
          'Value after second input (typeOnly):',
          valueAfterSecondInput,
        );

        // With typeOnly, the content should be appended, not replaced
        // Expected: "Hello World" (or at least containing both "Hello" and " World")
        expect(valueAfterSecondInput).toContain('Hello');
        expect(valueAfterSecondInput).toContain('World');
      } finally {
        await reset();
      }
    }, 60000);

    it('replace mode should clear existing input content', async () => {
      const { originPage, reset } = await launchPage('about:blank');

      await originPage.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <input id="test-input" type="text" placeholder="Test input" style="width: 300px; padding: 10px; font-size: 16px;" />
          </body>
        </html>
      `);

      const agent = new PuppeteerAgent(originPage);

      try {
        // Step 1: Input first value
        await agent.aiInput('Test input', { value: 'Hello' });

        const valueAfterFirstInput = await originPage.$eval(
          '#test-input',
          (el) => (el as HTMLInputElement).value,
        );
        console.log('Value after first input:', valueAfterFirstInput);
        expect(valueAfterFirstInput).toBe('Hello');

        // Step 2: Input second value with replace mode (default, should clear first)
        await agent.aiInput('Test input', { value: 'World', mode: 'replace' });

        const valueAfterSecondInput = await originPage.$eval(
          '#test-input',
          (el) => (el as HTMLInputElement).value,
        );
        console.log(
          'Value after second input (replace):',
          valueAfterSecondInput,
        );

        // With replace mode, only the new value should remain
        expect(valueAfterSecondInput).toBe('World');
        expect(valueAfterSecondInput).not.toContain('Hello');
      } finally {
        await reset();
      }
    }, 60000);
  },
  { timeout: 120000 },
);
