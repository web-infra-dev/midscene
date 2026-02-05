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
    await aiTap('Choose Single File', { fileChooserAccept: [testFile] });

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
    await aiTap('Choose Files', {
      fileChooserAccept: [testFile1, testFile2],
    });

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
      fileChooserAccept: ['./tests/ai/fixtures/relative-test.txt'],
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
      aiTap('Choose Files', {
        fileChooserAccept: ['./non-existent-file.txt'],
      }),
    ).rejects.toThrow(/File not found/);
  });

  test('should throw error when uploading multiple files to single-file input', async ({
    aiTap,
    aiAssert,
    page,
  }) => {
    const testFile1 = join(__dirname, '../../fixtures/test-file-1.txt');
    const testFile2 = join(__dirname, '../../fixtures/test-file-2.txt');

    await page.goto(
      `file://${join(__dirname, '../../fixtures/file-upload.html')}`,
    );

    // Attempt to upload multiple files to single-file input (no 'multiple' attribute)
    // This should throw an error because the input only accepts single file
    await expect(
      aiTap('Choose Single File', {
        fileChooserAccept: [testFile1, testFile2],
      }),
    ).rejects.toThrow(/Non-multiple file input/);

    // Verify that no files were uploaded after the error
    await aiAssert('page does not display "test-file-1.txt"');
    await aiAssert('page does not display "test-file-2.txt"');

    // Verify page is still interactive - can upload a single file successfully
    const testFile = join(__dirname, '../../fixtures/test-file.txt');
    await aiTap('Choose Single File', { fileChooserAccept: [testFile] });
    await aiAssert('page displays "test-file.txt"');
  });

  test('should allow page interaction when file chooser is triggered but no files provided', async ({
    aiTap,
    aiAssert,
    page,
  }) => {
    await page.goto(
      `file://${join(__dirname, '../../fixtures/file-upload.html')}`,
    );

    // Click the upload button without providing fileChooserAccept
    // The file chooser will be triggered but dismissed without selecting files
    await aiTap('Choose Single File');

    // Verify page is still interactive - can perform other actions
    await aiAssert('page displays "File Upload Test Page"');

    // Can still upload files after dismissing the chooser
    const testFile = join(__dirname, '../../fixtures/test-file.txt');
    await aiTap('Choose Single File', { fileChooserAccept: [testFile] });
    await aiAssert('page displays "test-file.txt"');
  });

  test('should upload directory with webkitdirectory input', async ({
    aiTap,
    aiAssert,
    page,
  }) => {
    const testDirectory = join(__dirname, '../../fixtures/test-directory');

    await page.goto(
      `file://${join(__dirname, '../../fixtures/file-upload.html')}`,
    );

    // Upload directory (Playwright 1.45+ supports this natively)
    await aiTap('Choose Directory', {
      fileChooserAccept: [testDirectory],
    });

    // Verify files from directory are selected
    await aiAssert('page displays "file1.txt"');
    await aiAssert('page displays "file2.txt"');
    await aiAssert('page displays "directory"');
  });
});
