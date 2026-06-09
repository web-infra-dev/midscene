import path from 'node:path';

export const DEFAULT_JPEG_FRAME_QUALITY = 0.95;
const DEFAULT_WEBM_VIDEO_BITRATE_MBPS = 2;
const DEFAULT_MP4_CRF = '18';

export function resolveVideoOutputPath(
  outputDir: string,
  name: string | undefined,
  format: 'webm' | 'mp4',
): string {
  const basename = name ?? 'midscene_replay';
  const ext = path.extname(basename).toLowerCase();
  if (ext === '.webm' || ext === '.mp4') {
    return path.join(outputDir, basename);
  }
  return path.join(outputDir, `${basename}.${format}`);
}

export function resolveVideoFormat(
  name: string | undefined,
  format: 'webm' | 'mp4' | undefined,
): 'webm' | 'mp4' {
  const ext = path.extname(name ?? '').toLowerCase();
  if (ext === '.mp4') return 'mp4';
  if (ext === '.webm') return 'webm';
  return format ?? 'webm';
}

export function ffmpegArgs(
  fps: number,
  format: 'webm' | 'mp4',
  framePattern: string,
  outputPath: string,
  scale: number,
): string[] {
  const common = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-framerate',
    String(fps),
    '-start_number',
    '0',
    '-i',
    framePattern,
    '-an',
  ];

  if (format === 'mp4') {
    return [
      ...common,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      DEFAULT_MP4_CRF,
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      outputPath,
    ];
  }

  return [
    ...common,
    '-c:v',
    'libvpx',
    '-b:v',
    `${DEFAULT_WEBM_VIDEO_BITRATE_MBPS * scale * scale}M`,
    '-pix_fmt',
    'yuv420p',
    outputPath,
  ];
}

export function resolveFrameExtension(frameFormat: 'jpeg' | 'png'): string {
  return frameFormat === 'jpeg' ? 'jpg' : 'png';
}

export function resolveFrameMimeType(
  frameFormat: 'jpeg' | 'png',
): 'image/jpeg' | 'image/png' {
  return frameFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
}
