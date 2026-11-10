export type PhotonModule = typeof import('@silvia-odwyer/photon');

export async function loadPhotonModule(): Promise<PhotonModule> {
  return import('@silvia-odwyer/photon');
}
