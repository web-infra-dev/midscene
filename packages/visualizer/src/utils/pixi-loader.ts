import 'pixi.js/unsafe-eval';
import * as PIXI from 'pixi.js';

const globalTextureMap = new Map<string, PIXI.Texture>();

/**
 * Check if we're in a file:// context where fetch() won't work for relative paths
 */
const isFileProtocol = (): boolean => {
  return (
    typeof window !== 'undefined' && window.location.protocol === 'file:'
  );
};

/**
 * Check if the image path is a relative path (not a data URL or absolute URL)
 */
const isRelativePath = (img: string): boolean => {
  // Explicitly check for relative paths starting with ./ or ../
  if (img.startsWith('./') || img.startsWith('../')) {
    return true;
  }
  // Also consider paths that don't have any URL scheme as relative
  if (
    !img.startsWith('data:') &&
    !img.startsWith('http://') &&
    !img.startsWith('https://') &&
    !img.startsWith('blob:')
  ) {
    return true;
  }
  return false;
};

/**
 * Load texture using Image object (works with file:// protocol)
 */
const loadTextureViaImage = (img: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const texture = PIXI.Texture.from(image);
      globalTextureMap.set(img, texture);
      resolve();
    };
    image.onerror = (e) => {
      reject(new Error(`Failed to load image: ${img}`));
    };
    image.src = img;
  });
};

export const loadTexture = async (img: string) => {
  if (globalTextureMap.has(img)) return;

  // For relative paths in file:// context, use Image object instead of PIXI.Assets.load
  // because fetch() doesn't work with file:// protocol due to CORS
  if (isFileProtocol() && isRelativePath(img)) {
    return loadTextureViaImage(img);
  }

  return PIXI.Assets.load(img).then((texture) => {
    globalTextureMap.set(img, texture);
  });
};

export const getTextureFromCache = (name: string) => {
  return globalTextureMap.get(name);
};

export const getTexture = async (name: string) => {
  if (globalTextureMap.has(name)) {
    return globalTextureMap.get(name);
  }

  await loadTexture(name);
  return globalTextureMap.get(name);
};
