import { ifInNode } from '../utils';
type TSharpModule = typeof import('sharp');

export default async function getSharp(): Promise<TSharpModule> {
  if (!ifInNode) {
    throw new Error('Sharp is only available in Node.js environment');
  }

  try {
    // @ts-ignore
    const sharp = await import('sharp');
    return sharp.default;
  } catch (error) {
    throw new Error(
      `Failed to load sharp module: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
