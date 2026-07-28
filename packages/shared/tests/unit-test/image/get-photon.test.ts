import { beforeEach, describe, expect, it, vi } from 'vitest';

const environment = vi.hoisted(() => ({
  browser: false,
  worker: false,
}));

const photonMocks = vi.hoisted(() => ({
  initialize: vi.fn(),
  loadModule: vi.fn(),
  newFromByteslice: vi.fn(),
}));

vi.mock('../../../src/utils', () => ({
  get ifInBrowser() {
    return environment.browser;
  },
  get ifInWorker() {
    return environment.worker;
  },
  ifInNode: false,
}));

vi.mock('../../../src/img/photon-loader', () => ({
  loadPhotonModule: photonMocks.loadModule,
}));

describe('getPhoton', () => {
  beforeEach(() => {
    vi.resetModules();
    environment.browser = false;
    environment.worker = false;
    photonMocks.initialize.mockReset();
    photonMocks.loadModule.mockReset();
    photonMocks.newFromByteslice.mockReset();
    photonMocks.loadModule.mockResolvedValue({
      default: photonMocks.initialize,
      PhotonImage: {
        new_from_byteslice: photonMocks.newFromByteslice,
      },
    });
  });

  it('propagates Photon initialization failures in browsers', async () => {
    environment.browser = true;
    const initializationError = new Error('WASM initialization failed');
    photonMocks.initialize.mockRejectedValue(initializationError);

    const { default: getPhoton } = await import('../../../src/img/get-photon');

    await expect(getPhoton()).rejects.toMatchObject({
      message: 'Failed to load photon module: WASM initialization failed',
      cause: initializationError,
    });
  });

  it('initializes Photon directly in workers', async () => {
    environment.worker = true;
    photonMocks.initialize.mockResolvedValue(undefined);

    const { default: getPhoton } = await import('../../../src/img/get-photon');
    const photon = await getPhoton();

    expect(photon.PhotonImage.new_from_byteslice).toBe(
      photonMocks.newFromByteslice,
    );
    expect(photonMocks.initialize).toHaveBeenCalledTimes(1);
    expect(photonMocks.loadModule).toHaveBeenCalledTimes(1);
  });
});
