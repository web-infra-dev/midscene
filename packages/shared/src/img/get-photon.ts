import type { PhotonImage, SamplingFilter } from '@cf-wasm/photon/node';

// 检测是否在浏览器环境中
const isBrowser =
  typeof window !== 'undefined' && typeof document !== 'undefined';

let photonModule: any = null;

export async function getPhoton(): Promise<{
  PhotonImage: typeof PhotonImage;
  SamplingFilter: typeof SamplingFilter;
  resize: (
    image: PhotonImage,
    width: number,
    height: number,
    filter: SamplingFilter,
  ) => PhotonImage;
  // 新增的方法
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
      // 浏览器环境：从 @cf-wasm/photon/others 导入
      photonModule = await import('@cf-wasm/photon/others');
    } else {
      // Node.js 环境：从 @cf-wasm/photon/node 导入
      photonModule = await import('@cf-wasm/photon/node');
    }

    return photonModule;
  } catch (error) {
    throw new Error(
      `Failed to load photon module: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
