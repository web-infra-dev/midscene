import { antiEscapeScriptTag } from '@midscene/shared/utils';

/**
 * Experimental report attachment format. One animated WebP stores multiple
 * screenshots, while the manifest maps the existing screenshot ids to frames.
 *
 * The viewer decodes every frame once into object URLs before parsing report
 * dumps. This deliberately keeps the rest of the viewer unchanged for the POC:
 * existing `<img>` consumers still receive a normal image URL.
 */
interface AnimatedWebpManifest {
  version: 1;
  sequenceId: string;
  frames: Array<{ id: string; frameIndex: number }>;
}

export interface AnimatedWebpPreparationResult {
  frameUrls: Map<string, string>;
  frameCount: number;
  decodeTimeMs: number;
  supported: boolean;
}

type ImageDecoderInstance = {
  completed: Promise<void>;
  tracks: {
    ready: Promise<void>;
    selectedTrack?: { frameCount: number };
  };
  decode: (options: { frameIndex: number }) => Promise<{ image: any }>;
  close: () => void;
};

type ImageDecoderConstructor = new (options: {
  data: Uint8Array;
  type: string;
  preferAnimation: boolean;
}) => ImageDecoderInstance;

function dataUriToBytes(dataUri: string): Uint8Array {
  const commaIndex = dataUri.indexOf(',');
  if (commaIndex < 0) {
    throw new Error('Animated WebP attachment is not a data URI');
  }
  const base64 = dataUri.slice(commaIndex + 1).replace(/\s/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to encode decoded Animated WebP frame'));
      }
    }, 'image/png');
  });
}

/**
 * Decode all report attachment sequences and return object URLs keyed by the
 * screenshot ids already present in report dumps. Returns unsupported rather
 * than throwing when the browser does not provide ImageDecoder.
 */
export async function prepareAnimatedWebpFrames(): Promise<AnimatedWebpPreparationResult> {
  const manifests = Array.from(
    document.querySelectorAll('script[type="midscene-animated-webp-manifest"]'),
  );
  if (manifests.length === 0) {
    return {
      frameUrls: new Map(),
      frameCount: 0,
      decodeTimeMs: 0,
      supported: true,
    };
  }

  const ImageDecoder = (
    globalThis as typeof globalThis & {
      ImageDecoder?: ImageDecoderConstructor;
    }
  ).ImageDecoder;
  if (!ImageDecoder) {
    return {
      frameUrls: new Map(),
      frameCount: 0,
      decodeTimeMs: 0,
      supported: false,
    };
  }

  const startTime = performance.now();
  const frameUrls = new Map<string, string>();

  for (const manifestElement of manifests) {
    const manifest = JSON.parse(
      antiEscapeScriptTag(manifestElement.textContent || ''),
    ) as AnimatedWebpManifest;
    if (manifest.version !== 1 || !manifest.sequenceId) {
      throw new Error('Unsupported Animated WebP report attachment manifest');
    }

    const dataElement = document.querySelector(
      `script[type="midscene-animated-webp"][data-id="${CSS.escape(manifest.sequenceId)}"]`,
    );
    if (!dataElement?.textContent) {
      throw new Error(
        `Animated WebP data for sequence "${manifest.sequenceId}" is missing`,
      );
    }

    const decoder = new ImageDecoder({
      data: dataUriToBytes(antiEscapeScriptTag(dataElement.textContent)),
      type: 'image/webp',
      preferAnimation: true,
    });
    try {
      await decoder.completed;
      await decoder.tracks.ready;
      const frameCount = decoder.tracks.selectedTrack?.frameCount;
      if (!frameCount) {
        throw new Error('Animated WebP does not expose any frames');
      }

      const idsByFrame = new Map<number, string[]>();
      for (const frame of manifest.frames) {
        if (frame.frameIndex < 0 || frame.frameIndex >= frameCount) {
          throw new Error(
            `Frame ${frame.frameIndex} is outside Animated WebP frame count ${frameCount}`,
          );
        }
        const ids = idsByFrame.get(frame.frameIndex) || [];
        ids.push(frame.id);
        idsByFrame.set(frame.frameIndex, ids);
      }

      for (const [frameIndex, ids] of idsByFrame) {
        const { image } = await decoder.decode({ frameIndex });
        try {
          const canvas = document.createElement('canvas');
          canvas.width = image.displayWidth;
          canvas.height = image.displayHeight;
          const context = canvas.getContext('2d');
          if (!context) {
            throw new Error('Unable to create a 2D canvas for Animated WebP');
          }
          context.drawImage(image, 0, 0);
          const url = URL.createObjectURL(await canvasBlob(canvas));
          for (const id of ids) {
            frameUrls.set(id, url);
          }
        } finally {
          image.close();
        }
      }
    } finally {
      decoder.close();
    }
  }

  return {
    frameUrls,
    frameCount: frameUrls.size,
    decodeTimeMs: performance.now() - startTime,
    supported: true,
  };
}
