import type Sharp from 'sharp';

// detect if in Node.js environment
const isNode = typeof process !== 'undefined' && process.versions?.node;

let sharpModule: typeof Sharp | null = null;

export default async function getSharp(): Promise<typeof Sharp> {
  if (sharpModule) {
    return sharpModule;
  }

  if (!isNode) {
    throw new Error('Sharp is only available in Node.js environment');
  }

  try {
    // import sharp dynamically, only available in Node.js environment
    const sharp = await import('sharp');
    sharpModule = sharp.default;
    return sharpModule;
  } catch (error) {
    throw new Error(
      `Failed to load sharp module: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
