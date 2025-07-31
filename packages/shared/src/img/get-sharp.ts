// detect if in Node.js environment
const isNode = typeof process !== 'undefined' && process.versions?.node;

let sharpModule: any = null;

export default async function getSharp(): Promise<any> {
  if (sharpModule) {
    return sharpModule;
  }

  if (!isNode) {
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
