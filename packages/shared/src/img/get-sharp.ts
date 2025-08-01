import { ifInNode } from '../utils';

let sharpModule: any = null;

export default async function getSharp(): Promise<any> {
  if (sharpModule) {
    return sharpModule;
  }

  if (!ifInNode) {
    throw new Error('Sharp is only available in Node.js environment');
  }

  try {
    // @ts-ignore
    const sharp = await import('sharp');
    sharpModule = sharp.default;
    return sharpModule;
  } catch (error) {
    throw new Error(
      `Failed to load sharp module: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
