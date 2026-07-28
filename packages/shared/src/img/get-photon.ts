import { getDebug } from '../logger';
import { ifInBrowser, ifInWorker } from '../utils';
import { loadPhotonModule } from './photon-loader';

const debug = getDebug('img');

let photonModule: any = null;
let isInitialized = false;

export default async function getPhoton(): Promise<{
  PhotonImage: typeof import('@silvia-odwyer/photon').PhotonImage;
  SamplingFilter: typeof import('@silvia-odwyer/photon').SamplingFilter;
  resize: typeof import('@silvia-odwyer/photon').resize;
  crop: typeof import('@silvia-odwyer/photon').crop;
  open_image: typeof import('@silvia-odwyer/photon').open_image;
  base64_to_image: typeof import('@silvia-odwyer/photon').base64_to_image;
  padding_uniform: typeof import('@silvia-odwyer/photon').padding_uniform;
  padding_left: typeof import('@silvia-odwyer/photon').padding_left;
  padding_right: typeof import('@silvia-odwyer/photon').padding_right;
  padding_top: typeof import('@silvia-odwyer/photon').padding_top;
  padding_bottom: typeof import('@silvia-odwyer/photon').padding_bottom;
  watermark: typeof import('@silvia-odwyer/photon').watermark;
  Rgba: typeof import('@silvia-odwyer/photon').Rgba;
}> {
  if (photonModule && isInitialized) {
    return photonModule;
  }

  const env = ifInBrowser ? 'browser' : ifInWorker ? 'worker' : 'unknown';
  debug(`Loading photon module in ${env} environment`);

  // Try to load Photon first
  try {
    if (ifInBrowser || ifInWorker) {
      // Browser and worker environments use @silvia-odwyer/photon.
      const photon = await loadPhotonModule();
      if (typeof photon.default === 'function') {
        // Ensure the WASM module is initialized before exposing its functions.
        await photon.default();
      }
      debug('Photon loaded: @silvia-odwyer/photon (browser/worker)');
      photonModule = photon;
    } else {
      throw new Error(
        'Photon is only available in browser or worker environments',
      );
    }

    // Verify that the critical Photon functions exist.
    if (!photonModule?.PhotonImage) {
      throw new Error('PhotonImage is not available');
    }
    if (
      !photonModule.PhotonImage.new_from_byteslice &&
      !photonModule.PhotonImage.new_from_base64
    ) {
      throw new Error(
        'PhotonImage.new_from_byteslice or new_from_base64 is not available',
      );
    }

    isInitialized = true;
    return photonModule;
  } catch (error) {
    debug(
      `Photon load failed: ${error instanceof Error ? error.message : String(error)}`,
    );

    throw new Error(
      `Failed to load photon module: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}
