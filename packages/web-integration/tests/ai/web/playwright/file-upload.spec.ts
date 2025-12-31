import { join } from 'node:path';
import { expect } from 'playwright/test';
import { test } from './fixture';

test.describe('file upload functionality', () => {
  test('should upload single file', async ({
    aiUploadFile,
    aiAssert,
    page,
  }) => {
    const testFile = join(__dirname, '../../fixtures/test-file.txt');

    await page.goto(
      `file://${join(__dirname, '../../fixtures/file-upload.html')}`,
    );

    // Upload single file
    await aiUploadFile('Choose Single File', testFile);

    // Verify file is selected
    await aiAssert('page displays "test-file.txt"');
    await aiAssert('page displays "single"');
  });

  test('should upload multiple files', async ({
    aiUploadFile,
    aiAssert,
    page,
  }) => {
    const testFile1 = join(__dirname, '../../fixtures/test-file-1.txt');
    const testFile2 = join(__dirname, '../../fixtures/test-file-2.txt');

    await page.goto(
      `file://${join(__dirname, '../../fixtures/file-upload.html')}`,
    );

    // Upload multiple files
    await aiUploadFile('Choose Files', [testFile1, testFile2]);

    // Verify files are selected
    await aiAssert('page displays "test-file-1.txt"');
    await aiAssert('page displays "test-file-2.txt"');
    await aiAssert('page displays "multiple"');
  });

  test('should handle relative paths', async ({
    aiUploadFile,
    aiAssert,
    page,
  }) => {
    const testFile = join(__dirname, '../../fixtures/relative-test.txt');

    await page.goto(
      `file://${join(__dirname, '../../fixtures/file-upload.html')}`,
    );

    // Upload file
    await aiUploadFile('Choose Single File', testFile);

    // Verify file is selected
    await aiAssert('page displays "relative-test.txt"');
  });

  test('should throw error for non-existent file', async ({
    aiUploadFile,
    page,
  }) => {
    await page.goto(
      `file://${join(__dirname, '../../fixtures/file-upload.html')}`,
    );

    // Attempt to upload non-existent file
    await expect(
      aiUploadFile('Choose Files', './non-existent-file.txt'),
    ).rejects.toThrow('File not found');
  });
});
