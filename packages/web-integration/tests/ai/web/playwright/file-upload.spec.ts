import { join } from 'node:path';
import { expect } from 'playwright/test';
import { test } from './fixture';

test.describe('file upload functionality', () => {
  test('should upload single file', async ({ aiTap, aiAssert, page }) => {
    const testFile = join(__dirname, '../../fixtures/test-file.txt');

    await page.goto(
      `file://${join(__dirname, '../../fixtures/file-upload.html')}`,
    );

    // Upload single file
    await aiTap('Choose Single File', { files: [testFile] });

    // Verify file is selected
    await aiAssert('page displays "test-file.txt"');
    await aiAssert('page displays "single"');
  });

  test('should upload multiple files', async ({ aiTap, aiAssert, page }) => {
    const testFile1 = join(__dirname, '../../fixtures/test-file-1.txt');
    const testFile2 = join(__dirname, '../../fixtures/test-file-2.txt');

    await page.goto(
      `file://${join(__dirname, '../../fixtures/file-upload.html')}`,
    );

    // Upload multiple files
    await aiTap('Choose Files', { files: [testFile1, testFile2] });

    // Verify files are selected
    await aiAssert('page displays "test-file-1.txt"');
    await aiAssert('page displays "test-file-2.txt"');
    await aiAssert('page displays "multiple"');
  });

  test('should handle relative paths', async ({ aiTap, aiAssert, page }) => {
    await page.goto(
      `file://${join(__dirname, '../../fixtures/file-upload.html')}`,
    );

    // Upload file using relative path
    await aiTap('Choose Single File', {
      files: ['./tests/ai/fixtures/relative-test.txt'],
    });

    // Verify file is selected
    await aiAssert('page displays "relative-test.txt"');
  });

  test('should throw error for non-existent file', async ({ aiTap, page }) => {
    await page.goto(
      `file://${join(__dirname, '../../fixtures/file-upload.html')}`,
    );

    // Attempt to upload non-existent file
    await expect(
      aiTap('Choose Files', { files: ['./non-existent-file.txt'] }),
    ).rejects.toThrow('File not found');
  });
});
