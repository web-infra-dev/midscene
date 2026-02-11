import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const dynamicRequire = createRequire(import.meta.url);
let ff: string;
try {
  ff = dynamicRequire('@ffmpeg-installer/ffmpeg').path;
} catch {
  ff = 'ffmpeg';
}

// ADB PNG
const adbPng = execSync('adb exec-out screencap -p');
writeFileSync('/tmp/bench_adb.png', adbPng);
console.log(
  `ADB PNG (full-res):       ${(adbPng.length / 1024).toFixed(0)} KB`,
);

// JPEG q5 full-res
const j1 = execSync(
  `${ff} -y -f png_pipe -i pipe:0 -vframes 1 -vcodec mjpeg -q:v 5 -f mjpeg pipe:1`,
  { input: adbPng, maxBuffer: 50 * 1024 * 1024 },
);
writeFileSync('/tmp/bench_jpeg_full.jpg', j1);
console.log(`JPEG q5 (full-res):       ${(j1.length / 1024).toFixed(0)} KB`);

// JPEG q5 scaled 720w
const j2 = execSync(
  `${ff} -y -f png_pipe -i pipe:0 -vframes 1 -vf scale=720:-2 -vcodec mjpeg -q:v 5 -f mjpeg pipe:1`,
  { input: adbPng, maxBuffer: 50 * 1024 * 1024 },
);
writeFileSync('/tmp/bench_jpeg_720.jpg', j2);
console.log(`JPEG q5 (720w scaled):    ${(j2.length / 1024).toFixed(0)} KB`);

// PNG scaled 720w
const p2 = execSync(
  `${ff} -y -f png_pipe -i pipe:0 -vframes 1 -vf scale=720:-2 -vcodec png -f image2pipe pipe:1`,
  { input: adbPng, maxBuffer: 50 * 1024 * 1024 },
);
writeFileSync('/tmp/bench_png_720.png', p2);
console.log(`PNG (720w scaled):        ${(p2.length / 1024).toFixed(0)} KB`);

console.log(
  '\nOpen: open /tmp/bench_adb.png /tmp/bench_jpeg_full.jpg /tmp/bench_jpeg_720.jpg /tmp/bench_png_720.png',
);
