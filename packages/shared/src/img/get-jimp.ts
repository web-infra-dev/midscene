import type Jimp from 'jimp/browser/lib/jimp.js';

const ifInBrowser = typeof window !== 'undefined';
export default async function getJimp(): Promise<typeof Jimp> {
  if (ifInBrowser) {
    await import('jimp/browser/lib/jimp.js');
    return (window as any).Jimp;
  }
  // return Jimp;
  return (await import('jimp')).default;
}
