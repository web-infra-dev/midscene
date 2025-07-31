import { ifInBrowser, ifInWorker } from '../utils';

const isNode = typeof process !== 'undefined' && process.versions?.node;
let photonModule: any = null;
let isInitialized = false;

export default async function getPhoton(): Promise<{
  PhotonImage: typeof import('@silvia-odwyer/photon-node').PhotonImage;
  SamplingFilter: typeof import('@silvia-odwyer/photon-node').SamplingFilter;
  resize: typeof import('@silvia-odwyer/photon-node').resize;
  crop: typeof import('@silvia-odwyer/photon-node').crop;
  open_image: typeof import('@silvia-odwyer/photon-node').open_image;
  base64_to_image: typeof import('@silvia-odwyer/photon-node').base64_to_image;
}> {
  if (photonModule && isInitialized) {
    return photonModule;
  }

  try {
    if (ifInBrowser || ifInWorker) {
      // Regular browser environment: use @silvia-odwyer/photon
      const photon = await import('@silvia-odwyer/photon');
      if (typeof photon.default === 'function') {
        // for browser environment, ensure WASM module is correctly initialized
        await photon.default();
      }

      photonModule = photon;
    } else if (isNode) {
      // Node.js environment: use @silvia-odwyer/photon-node
      photonModule = await import('@silvia-odwyer/photon-node');
    }

    // verify that the critical functions exist
    if (
      !photonModule.PhotonImage ||
      !photonModule.PhotonImage.new_from_byteslice
    ) {
      throw new Error('PhotonImage.new_from_byteslice is not available');
    }

    isInitialized = true;
    return photonModule;
  } catch (error) {
    throw new Error(
      `Failed to load photon module: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
