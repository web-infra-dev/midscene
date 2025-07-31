// @ts-ignore
import Jimp from 'jimp';
import { ifInBrowser, ifInWorker } from '../utils';

export default async function getJimp(): Promise<typeof Jimp> {
  if (ifInBrowser || ifInWorker) {
    // @ts-ignore
    await import('jimp/browser/lib/jimp.js');
    return (typeof window !== 'undefined' ? window : (self as any)).Jimp;
  }
  return Jimp;
}
