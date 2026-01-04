import { join } from 'node:path';
import { PuppeteerAgent } from '@/puppeteer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { launchPage } from './utils';

vi.setConfig({
  testTimeout: 60 * 1000,
});

describe('file upload functionality', () => {
  let resetFn: () => Promise<void>;

  afterEach(async () => {
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

    const agent = new PuppeteerAgent(originPage);

    // Upload single file
    await agent.aiUploadFile('Choose Single File', testFile);

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

    const agent = new PuppeteerAgent(originPage);

    // Upload multiple files
    await agent.aiUploadFile('Choose Files', [testFile1, testFile2]);

    // Verify files are selected
    await agent.aiAssert('page displays "test-file-1.txt"');
    await agent.aiAssert('page displays "test-file-2.txt"');
    await agent.aiAssert('page displays "multiple"');
  });

  it('should handle relative paths', async () => {
    const { originPage, reset } = await launchPage(
      `file://${join(__dirname, '../../fixtures/file-upload.html')}`,
    );
    resetFn = reset;

    const agent = new PuppeteerAgent(originPage);

    // Upload file using relative path
    await agent.aiUploadFile(
      'Choose Single File',
      './tests/ai/fixtures/relative-test.txt',
    );

    // Verify file is selected
    await agent.aiAssert('page displays "relative-test.txt"');
  });

  it('should throw error for non-existent file', async () => {
    const { originPage, reset } = await launchPage(
      `file://${join(__dirname, '../../fixtures/file-upload.html')}`,
    );
    resetFn = reset;

    const agent = new PuppeteerAgent(originPage);

    // Attempt to upload non-existent file
    await expect(
      agent.aiUploadFile('Choose Files', './non-existent-file.txt'),
    ).rejects.toThrow('File not found');
  });
});
