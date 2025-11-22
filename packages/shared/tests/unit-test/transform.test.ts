import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { preProcessImageUrl } from '../../src/img/transform';

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
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(mockData, { status: 200, headers: { 'content-type': 'image/svg+xml' } }),
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
