import type { PhotonImage, SamplingFilter } from '@cf-wasm/photon/node';

// check if in browser environment
const isBrowser =
  typeof window !== 'undefined' && typeof document !== 'undefined';

let photonModule: any = null;

export default async function getPhoton(): Promise<{
  PhotonImage: typeof PhotonImage;
  SamplingFilter: typeof SamplingFilter;
  resize: (
    image: PhotonImage,
    width: number,
    height: number,
    filter: SamplingFilter,
  ) => PhotonImage;
  // new methods
  crop: (
    image: PhotonImage,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => PhotonImage;
  open_image: (bytes: Uint8Array) => PhotonImage;
  base64_to_image: (base64: string) => PhotonImage;
}> {
  if (photonModule) {
    return photonModule;
  }

  try {
    if (isBrowser) {
      // browser environment: import from @cf-wasm/photon/others
      photonModule = await import('@cf-wasm/photon/others');
    } else {
      // Node.js environment: import from @cf-wasm/photon/node
      photonModule = await import('@cf-wasm/photon/node');
    }

    return photonModule;
  } catch (error) {
    throw new Error(
      `Failed to load photon module: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
