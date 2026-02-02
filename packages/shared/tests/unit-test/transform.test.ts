import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { preProcessImageUrl, scaleImage } from '../../src/img/transform';

describe('preapareImageUrl', () => {
  it('url is not a string will throw an error', async () => {
    await expect(preProcessImageUrl(1 as any, false)).rejects.toThrowError(
      'url must be a string, but got 1 with type number',
    );
    await expect(preProcessImageUrl({} as any, false)).rejects.toThrowError(
      'url must be a string, but got [object Object] with type object',
    );
    await expect(preProcessImageUrl(null as any, false)).rejects.toThrow(
      'url must be a string, but got null with type object',
    );
    await expect(preProcessImageUrl(undefined as any, false)).rejects.toThrow(
      'url must be a string, but got undefined with type undefined',
    );
  });

  it('base64 string will not be converted', async () => {
    expect(await preProcessImageUrl('data:image/png;base64,aaa', false)).toBe(
      'data:image/png;base64,aaa',
    );
  });

  it('local file path will be converted to base64', async () => {
    expect(
      await preProcessImageUrl(
        path.resolve(__dirname, '../fixtures/2x2.jpeg'),
        false,
      ),
    ).toMatchInlineSnapshot(
      `"data:image/jpeg;base64,/9j/4AAQSkZJRgABAgEASABIAAD/4QDKRXhpZgAATU0AKgAAAAgABgESAAMAAAABAAEAAAEaAAUAAAABAAAAVgEbAAUAAAABAAAAXgEoAAMAAAABAAIAAAITAAMAAAABAAEAAIdpAAQAAAABAAAAZgAAAAAAAABIAAAAAQAAAEgAAAABAAeQAAAHAAAABDAyMjGRAQAHAAAABAECAwCgAAAHAAAABDAxMDCgAQADAAAAAQABAACgAgAEAAAAAQAAAAKgAwAEAAAAAQAAAAKkBgADAAAAAQAAAAAAAAAAAAD/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9sAQwABAQEBAQECAQECAwICAgMEAwMDAwQFBAQEBAQFBgUFBQUFBQYGBgYGBgYGBwcHBwcHCAgICAgJCQkJCQkJCQkJ/9sAQwEBAQECAgIEAgIECQYFBgkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJ/90ABAAB/9oADAMBAAIRAxEAPwD+/iiiigD/2Q=="`,
    );
  });

  it('http url will not be converted to base64 by default', async () => {
    expect(
      await preProcessImageUrl(
        'https://github.githubassets.com/favicons/favicon.svg',
        false,
      ),
    ).toBe('https://github.githubassets.com/favicons/favicon.svg');
  });

  it('http url will be converted to base64 if convertHttpImage2Base64 is true', async () => {
    const mockData = Buffer.from('image-data');
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(mockData, {
        status: 200,
        headers: { 'content-type': 'image/svg+xml' },
      }),
    );

    const base64 = await preProcessImageUrl(
      'https://github.githubassets.com/favicons/favicon.svg',
      true,
    );

    expect(base64).toBe(
      `data:image/svg+xml;base64,${mockData.toString('base64')}`,
    );
    fetchSpy.mockRestore();
  });
});

describe('scaleImage', () => {
  // 1x1 white pixel JPEG image in base64
  const onePixelWhiteImage =
    'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAMDAwMDAwMDAwMEBAQEBAYFBQUFBgkGBwYHBgkOCAoICAoIDgwPDAsMDwwWEQ8PERYZFRQVGR4bGx4mJCYyMkMBAwMDAwMDAwMDAwQEBAQEBgUFBQUGCQYHBgcGCQ4ICggICggODA8MCwwPDBYRDw8RFhkVFBUZHhsbHiYkJjIyQ//CABEIAAEAAQMBIgACEQEDEQH/xAAnAAEBAAAAAAAAAAAAAAAAAAAACQEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEAMQAAAAqmD/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/AH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AH//2Q==';

  it('should scale up image by 2x and verify dimensions', async () => {
    const result = await scaleImage(onePixelWhiteImage, 2);

    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(result.imageBase64).toMatchInlineSnapshot(
      `"data:image/jpeg;base64,/9j/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpgA//Z"`,
    );
  });

  it('should scale up image by 3x and verify dimensions', async () => {
    const result = await scaleImage(onePixelWhiteImage, 3);

    expect(result.width).toBe(3);
    expect(result.height).toBe(3);
    expect(result.imageBase64).toMatchInlineSnapshot(
      `"data:image/jpeg;base64,/9j/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAADAAMDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpgA//Z"`,
    );
  });

  it('should throw error for negative scale factor', async () => {
    await expect(scaleImage(onePixelWhiteImage, -1)).rejects.toThrow(
      'Scale factor must be positive',
    );
  });

  it('should throw error for zero scale factor', async () => {
    await expect(scaleImage(onePixelWhiteImage, 0)).rejects.toThrow(
      'Scale factor must be positive',
    );
  });

  it('should fall back to Photon when Sharp fails', async () => {
    // Mock getSharp to throw an error
    const getSharpModule = await import('../../src/img/get-sharp');
    const originalGetSharp = getSharpModule.default;

    vi.spyOn(getSharpModule, 'default').mockRejectedValue(
      new Error('Sharp not available'),
    );

    const result = await scaleImage(onePixelWhiteImage, 2);

    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(result.imageBase64).toMatchInlineSnapshot(
      `"data:image/jpeg;base64,/9j/4AAQSkZJRgABAgAAAQABAAD/wAARCAACAAIDAREAAhEBAxEB/9sAQwADAgIDAgIDAwMDBAMDBAUIBQUEBAUKBwcGCAwKDAwLCgsLDQ4SEA0OEQ4LCxAWEBETFBUVFQwPFxgWFBgSFBUU/9sAQwEDBAQFBAUJBQUJFA0LDRQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6AP/9k="`,
    );

    // Restore original implementation
    vi.spyOn(getSharpModule, 'default').mockResolvedValue(
      await originalGetSharp(),
    );
  });

  it('should fall back to Photon when Sharp throws during processing', async () => {
    // Mock getSharp to return a mock Sharp that throws during processing
    const getSharpModule = await import('../../src/img/get-sharp');
    const mockSharp = vi.fn(() => {
      throw new Error('Sharp processing failed');
    });

    vi.spyOn(getSharpModule, 'default').mockResolvedValue(mockSharp as any);

    const result = await scaleImage(onePixelWhiteImage, 3);

    expect(result.width).toBe(3);
    expect(result.height).toBe(3);
    expect(result.imageBase64).toMatchInlineSnapshot(
      `"data:image/jpeg;base64,/9j/4AAQSkZJRgABAgAAAQABAAD/wAARCAADAAMDAREAAhEBAxEB/9sAQwADAgIDAgIDAwMDBAMDBAUIBQUEBAUKBwcGCAwKDAwLCgsLDQ4SEA0OEQ4LCxAWEBETFBUVFQwPFxgWFBgSFBUU/9sAQwEDBAQFBAUJBQUJFA0LDRQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9U6AP/9k="`,
    );

    // Restore
    vi.restoreAllMocks();
  });
});
