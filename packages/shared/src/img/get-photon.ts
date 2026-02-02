import { getDebug } from '../logger';
import { ifInBrowser, ifInNode, ifInWorker } from '../utils';

const debug = getDebug('img');

let photonModule: any = null;
let isInitialized = false;

export default async function getPhoton(): Promise<{
  PhotonImage: typeof import('@silvia-odwyer/photon-node').PhotonImage;
  SamplingFilter: typeof import('@silvia-odwyer/photon-node').SamplingFilter;
  resize: typeof import('@silvia-odwyer/photon-node').resize;
  crop: typeof import('@silvia-odwyer/photon-node').crop;
  open_image: typeof import('@silvia-odwyer/photon-node').open_image;
  base64_to_image: typeof import('@silvia-odwyer/photon-node').base64_to_image;
  padding_uniform: typeof import('@silvia-odwyer/photon-node').padding_uniform;
  padding_left: typeof import('@silvia-odwyer/photon-node').padding_left;
  padding_right: typeof import('@silvia-odwyer/photon-node').padding_right;
  padding_top: typeof import('@silvia-odwyer/photon-node').padding_top;
  padding_bottom: typeof import('@silvia-odwyer/photon-node').padding_bottom;
  watermark: typeof import('@silvia-odwyer/photon-node').watermark;
  Rgba: typeof import('@silvia-odwyer/photon-node').Rgba;
}> {
  if (photonModule && isInitialized) {
    return photonModule;
  }

  try {
    const env = ifInBrowser
      ? 'browser'
      : ifInWorker
        ? 'worker'
        : ifInNode
          ? 'node'
          : 'unknown';
    debug(`Loading photon module in ${env} environment`);

    if (ifInBrowser || ifInWorker) {
      // Regular browser environment: use @silvia-odwyer/photon
      const photon = await import('@silvia-odwyer/photon');
      if (typeof photon.default === 'function') {
        // for browser environment, ensure WASM module is correctly initialized
        await photon.default();
      }
      debug('Photon loaded: @silvia-odwyer/photon (browser/worker)');
      console.log('[midscene:img] Photon loaded: @silvia-odwyer/photon (browser/worker)');
      photonModule = photon;
    } else if (ifInNode) {
      // Node.js environment: use @silvia-odwyer/photon-node
      photonModule = await import('@silvia-odwyer/photon-node');
      debug('Photon loaded: @silvia-odwyer/photon-node (node)');
      console.log('[midscene:img] Photon loaded: @silvia-odwyer/photon-node (node)');
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
