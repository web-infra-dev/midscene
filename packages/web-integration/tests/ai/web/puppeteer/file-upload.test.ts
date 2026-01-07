import { join } from 'node:path';
import { PuppeteerAgent } from '@/puppeteer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchPage } from './utils';

vi.setConfig({
  testTimeout: 60 * 1000,
});

describe('file upload functionality', () => {
  let resetFn: () => Promise<void>;
  let agent: PuppeteerAgent;

  afterEach(async () => {
    if (agent) {
      try {
        await agent.destroy();
      } catch (e) {
        console.warn('agent destroy error', e);
      }
    }
    if (resetFn) {
      await resetFn();
    }
  });

  it('should upload single file', async () => {
    const testFile = join(__dirname, '../../fixtures/test-file.txt');

    const { originPage, reset } = await launchPage(
      `file://${join(__dirname, '../../fixtures/file-upload.html')}`,
    );
    resetFn = reset;

    agent = new PuppeteerAgent(originPage);

    // Upload single file
    await agent.aiTap('Choose Single File', { fileChooserAccept: [testFile] });

    // Verify file is selected
    await agent.aiAssert('page displays "test-file.txt"');
    await agent.aiAssert('page displays "single"');
  });

  it('should upload multiple files', async () => {
    const testFile1 = join(__dirname, '../../fixtures/test-file-1.txt');
    const testFile2 = join(__dirname, '../../fixtures/test-file-2.txt');

    const { originPage, reset } = await launchPage(
      `file://${join(__dirname, '../../fixtures/file-upload.html')}`,
    );
    resetFn = reset;

    agent = new PuppeteerAgent(originPage);

    // Upload multiple files
    await agent.aiTap('Choose Files', {
      fileChooserAccept: [testFile1, testFile2],
    });

    // Verify files are selected
    await agent.aiAssert('page displays "test-file-1.txt"');
    await agent.aiAssert('page displays "test-file-2.txt"');
    await agent.aiAssert('page displays "multiple"');
  });

  it('should upload files via aiAct', async () => {
    const testFile1 = join(__dirname, '../../fixtures/test-file-1.txt');
    const testFile2 = join(__dirname, '../../fixtures/test-file-2.txt');

    const { originPage, reset } = await launchPage(
      `file://${join(__dirname, '../../fixtures/file-upload.html')}`,
    );
    resetFn = reset;

    agent = new PuppeteerAgent(originPage);

    await agent.aiAct(
      'click "Choose Files" button above the text "Supports multiple file upload"',
      {
        fileChooserAccept: [testFile1, testFile2],
      },
    );

    await agent.aiAssert('page displays "test-file-1.txt"');
    await agent.aiAssert('page displays "test-file-2.txt"');
    await agent.aiAssert('page displays "multiple"');
  });

  it('should not time out when no file chooser is triggered in aiAct', async () => {
    const testFile = join(__dirname, '../../fixtures/test-file.txt');

    const { originPage, reset } = await launchPage(
      `file://${join(__dirname, '../../fixtures/file-upload.html')}`,
    );
    resetFn = reset;

    agent = new PuppeteerAgent(originPage);

    await agent.aiAct('click the page title', {
      fileChooserAccept: [testFile],
    });
  });

  it('should handle relative paths', async () => {
    const { originPage, reset } = await launchPage(
      `file://${join(__dirname, '../../fixtures/file-upload.html')}`,
    );
    resetFn = reset;

    agent = new PuppeteerAgent(originPage);

    // Upload file using relative path
    await agent.aiTap('Choose Single File', {
      fileChooserAccept: ['./tests/ai/fixtures/relative-test.txt'],
    });

    // Verify file is selected
    await agent.aiAssert('page displays "relative-test.txt"');
  });

  it('should throw error for non-existent file', async () => {
    const { originPage, reset } = await launchPage(
      `file://${join(__dirname, '../../fixtures/file-upload.html')}`,
    );
    resetFn = reset;

    agent = new PuppeteerAgent(originPage);

    // Attempt to upload non-existent file
    await expect(
      agent.aiTap('Choose Files', {
        fileChooserAccept: ['./non-existent-file.txt'],
      }),
    ).rejects.toThrow(/File not found/);
  });

  it('should not time out when no file chooser is triggered', async () => {
    const testFile = join(__dirname, '../../fixtures/test-file.txt');

    const { originPage, reset } = await launchPage(
      `file://${join(__dirname, '../../fixtures/file-upload.html')}`,
    );
    resetFn = reset;

    agent = new PuppeteerAgent(originPage);

    await agent.aiTap('the title "File Upload Test Page"', {
      fileChooserAccept: [testFile],
    });
  });
});
