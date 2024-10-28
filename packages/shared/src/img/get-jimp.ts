const ifInBrowser = typeof window !== 'undefined';
export default async function getJimp(): Promise<typeof import('jimp')> {
  if (ifInBrowser) {
    return (await import('jimp/browser/lib/jimp.js')).default;
  }
  return (await import('jimp')).default;
}
