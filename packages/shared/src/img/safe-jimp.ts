import { writeFileSync } from 'node:fs';
import type { Buffer } from 'node:buffer';
import type Jimp from 'jimp';
import { getDebug } from '../logger';

const imgDebug = getDebug('img');

/**
 * Wrapper for Jimp.read that saves problematic buffers to /tmp for debugging
 * when "Could not find MIME" errors occur
 *
 * @param imageBuffer - The image buffer to read
 * @param Jimp - The Jimp instance
 * @returns Promise resolving to Jimp image
 * @throws Error with additional context if MIME detection fails
 */
export async function safeJimpRead(
  imageBuffer: Buffer,
  Jimp: typeof import('jimp'),
): Promise<Jimp> {
  try {
    return await Jimp.read(imageBuffer);
  } catch (error: any) {
    // Check if this is the MIME error we're looking for
    if (error?.message?.includes('Could not find MIME')) {
      const timestamp = Date.now();
      const filename = `jimp-error-${timestamp}.bin`;
      const filepath = `/tmp/${filename}`;

      try {
        writeFileSync(filepath, imageBuffer);
        imgDebug(
          `Jimp MIME error detected. Problematic buffer saved to: ${filepath} (size: ${imageBuffer.length} bytes)`,
        );
      } catch (saveError) {
        imgDebug(`Failed to save problematic buffer: ${saveError}`);
      }

      // Re-throw the error with additional context
      throw new Error(
        `Could not find MIME for Buffer. Problematic buffer saved to: ${filepath} (size: ${imageBuffer.length} bytes)`,
        { cause: error },
      );
    }

    // Re-throw other errors as-is
    throw error;
  }
}
