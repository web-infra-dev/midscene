import 'pixi.js/unsafe-eval';
import * as PIXI from 'pixi.js';

const globalTextureMap = new Map<string, PIXI.Texture>();

export const loadTexture = async (img: string) => {
  // Validate input - must be a non-empty string
  if (typeof img !== 'string' || img.length === 0) {
    console.warn('loadTexture: invalid img parameter', typeof img, img);
    return;
  }
  if (globalTextureMap.has(img)) return;
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
