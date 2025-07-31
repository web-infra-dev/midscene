// @ts-ignore
import type Jimp from 'jimp/browser/lib/jimp.js';
import { ifInBrowser, ifInWorker } from '../utils';

export default async function getJimp(): Promise<typeof Jimp> {
  if (ifInBrowser) {
    // @ts-ignore
    await import('jimp/browser/lib/jimp.js');
    return (window as any).Jimp;
  }
  // return Jimp;
  // @ts-ignore
  return (await import('jimp')).default;
}
