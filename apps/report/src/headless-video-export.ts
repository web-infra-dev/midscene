/**
 * Headless video export hook.
 *
 * Exposes `window.__midscene_exportVideoToBase64` so the Midscene CLI can drive
 * a headless browser, load a report HTML, and produce the replay video that the
 * report UI would otherwise download via the "Export video" button — without any
 * user interaction. See `@midscene/cli` `report-video` command.
 */
import {
  type BrandedFrameRenderer,
  allScriptsFromDump,
  calculateFrameMap,
  createBrandedFrameRenderer,
  recordBrandedVideo,
} from '@midscene/visualizer';
import { readReportDumpGroups } from './utils/read-report-dumps';

export interface HeadlessVideoExportOptions {
  // Which dump group to render when the report contains multiple groups.
  // Defaults to 0 (the first group).
  index?: number;
  autoZoom?: boolean;
  scale?: number;
}

export interface HeadlessVideoFrameSessionInfo {
  totalFrames: number;
  fps: number;
  width: number;
  height: number;
}

export interface HeadlessVideoFrameRenderOptions {
  type?: 'image/jpeg' | 'image/png';
  quality?: number;
}

let activeFrameRenderer: BrandedFrameRenderer | null = null;

function mountFrameCanvas(renderer: BrandedFrameRenderer): void {
  const { canvas } = renderer;
  canvas.setAttribute('data-midscene-video-frame-canvas', 'true');
  Object.assign(canvas.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: `${renderer.width}px`,
    height: `${renderer.height}px`,
    zIndex: '2147483647',
    background: '#000',
  });
  if (!canvas.parentElement) {
    document.body.appendChild(canvas);
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('failed to read video blob'));
    reader.onload = () => {
      const result = reader.result as string;
      // strip the `data:<mime>;base64,` prefix
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}

function resolveReportFrameMap(options?: HeadlessVideoExportOptions) {
  const groups = readReportDumpGroups();
  if (groups.length === 0) {
    throw new Error('no dump data found in the report');
  }
  const index = options?.index ?? 0;
  const dump = groups[index];
  if (!dump) {
    throw new Error(
      `dump group index ${index} out of range (found ${groups.length} group(s))`,
    );
  }

  const info = allScriptsFromDump(dump);
  if (!info?.scripts?.length) {
    throw new Error('no replayable scripts in the report');
  }

  return calculateFrameMap(info.scripts, {
    imageWidth: info.width,
    imageHeight: info.height,
  });
}

export async function exportReportVideoToBase64(
  options?: HeadlessVideoExportOptions,
): Promise<string> {
  const frameMap = resolveReportFrameMap(options);
  const blob = await recordBrandedVideo(frameMap, {
    autoZoom: options?.autoZoom ?? true,
    headless: true,
    scale: options?.scale,
  });
  return blobToBase64(blob);
}

export async function prepareReportVideoFrames(
  options?: HeadlessVideoExportOptions,
): Promise<HeadlessVideoFrameSessionInfo> {
  disposeReportVideoFrames();
  const frameMap = resolveReportFrameMap(options);
  activeFrameRenderer = await createBrandedFrameRenderer(frameMap, {
    autoZoom: options?.autoZoom ?? true,
    scale: options?.scale,
  });
  mountFrameCanvas(activeFrameRenderer);
  return {
    totalFrames: activeFrameRenderer.totalFrames,
    fps: activeFrameRenderer.fps,
    width: activeFrameRenderer.width,
    height: activeFrameRenderer.height,
  };
}

export function renderReportVideoFrame(frameIndex: number): void {
  if (!activeFrameRenderer) {
    throw new Error('video frame renderer has not been prepared');
  }
  activeFrameRenderer.renderFrame(frameIndex);
}

export async function renderReportVideoFrameToBase64(
  frameIndex: number,
  options?: HeadlessVideoFrameRenderOptions,
): Promise<string> {
  if (!activeFrameRenderer) {
    throw new Error('video frame renderer has not been prepared');
  }
  const dataURL = activeFrameRenderer.renderFrameToDataURL(
    frameIndex,
    options?.type ?? 'image/png',
    options?.quality,
  );
  return dataURL.slice(dataURL.indexOf(',') + 1);
}

export function disposeReportVideoFrames(): void {
  activeFrameRenderer?.canvas.remove();
  activeFrameRenderer?.dispose();
  activeFrameRenderer = null;
}

declare global {
  interface Window {
    __midscene_exportVideoToBase64?: (
      options?: HeadlessVideoExportOptions,
    ) => Promise<string>;
    __midscene_prepareVideoFrames?: (
      options?: HeadlessVideoExportOptions,
    ) => Promise<HeadlessVideoFrameSessionInfo>;
    __midscene_renderVideoFrameToBase64?: (
      frameIndex: number,
      options?: HeadlessVideoFrameRenderOptions,
    ) => Promise<string>;
    __midscene_renderVideoFrame?: (frameIndex: number) => void;
    __midscene_disposeVideoFrames?: () => void;
  }
}

export function installHeadlessVideoExport(): void {
  if (typeof window === 'undefined') return;
  window.__midscene_exportVideoToBase64 = exportReportVideoToBase64;
  window.__midscene_prepareVideoFrames = prepareReportVideoFrames;
  window.__midscene_renderVideoFrame = renderReportVideoFrame;
  window.__midscene_renderVideoFrameToBase64 = renderReportVideoFrameToBase64;
  window.__midscene_disposeVideoFrames = disposeReportVideoFrames;
}
