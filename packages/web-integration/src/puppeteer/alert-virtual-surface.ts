import { Buffer } from 'node:buffer';
import type {
  ElementCacheFeature,
  ElementTreeNode,
  Rect,
  Size,
} from '@midscene/core';
import type { ElementInfo } from '@midscene/shared/extractor';
import {
  convertImgBufferToJpeg,
  createImgBase64ByFormat,
} from '@midscene/shared/img';
import type {
  VirtualWebSurface,
  VirtualWebSurfaceAction,
} from '../common/virtual-web-surface';

export type AlertVirtualSurfaceDecision = { type: 'accept' };

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function wrapMessage(message: string, maxCharacters: number): string[] {
  const lines: string[] = [];
  for (const sourceLine of message.split(/\r?\n/)) {
    if (!sourceLine) {
      lines.push('');
      continue;
    }
    for (let offset = 0; offset < sourceLine.length; offset += maxCharacters) {
      lines.push(sourceLine.slice(offset, offset + maxCharacters));
    }
  }
  return lines.slice(0, 4);
}

function contains(rect: Rect, x: number, y: number): boolean {
  return (
    x >= rect.left &&
    x <= rect.left + rect.width &&
    y >= rect.top &&
    y <= rect.top + rect.height
  );
}

export class AlertVirtualSurface implements VirtualWebSurface {
  readonly confirmRect: Rect;

  private readonly dialogRect: Rect;

  private readonly decisionPromise: Promise<AlertVirtualSurfaceDecision>;

  private resolveDecision!: (decision: AlertVirtualSurfaceDecision) => void;

  private accepted = false;

  private screenshotPromise?: Promise<string>;

  constructor(
    private readonly message: string,
    private readonly viewportSize: Size,
  ) {
    const dialogWidth = Math.min(
      560,
      Math.max(320, Math.round(viewportSize.width * 0.66)),
    );
    const messageLineCount = wrapMessage(
      message || 'This page says',
      56,
    ).length;
    const dialogHeight = Math.min(
      220,
      132 + Math.max(0, messageLineCount - 1) * 20,
    );
    this.dialogRect = {
      left: Math.round((viewportSize.width - dialogWidth) / 2),
      top: Math.min(32, Math.max(12, Math.round(viewportSize.height * 0.05))),
      width: Math.round(dialogWidth),
      height: Math.round(dialogHeight),
    };
    this.confirmRect = {
      left: this.dialogRect.left + this.dialogRect.width - 81,
      top: this.dialogRect.top + this.dialogRect.height - 49,
      width: 65,
      height: 33,
    };
    this.decisionPromise = new Promise((resolve) => {
      this.resolveDecision = resolve;
    });
  }

  size(): Promise<Size> {
    return Promise.resolve(this.viewportSize);
  }

  screenshotBase64(): Promise<string> {
    this.screenshotPromise ??= this.renderScreenshot();
    return this.screenshotPromise;
  }

  getElementsNodeTree(): Promise<ElementTreeNode<ElementInfo>> {
    return Promise.resolve({ node: null, children: [] });
  }

  cacheFeatureForPoint(): Promise<ElementCacheFeature> {
    return Promise.resolve({ xpaths: [] });
  }

  rectMatchesCacheFeature(): Promise<Rect> {
    throw new Error(
      '[midscene] Element cache matching is unavailable on an alert virtual surface.',
    );
  }

  dispatchAction(action: VirtualWebSurfaceAction): Promise<void> {
    if (
      action.type === 'mouse.click' &&
      action.button === 'left' &&
      contains(this.confirmRect, action.x, action.y)
    ) {
      this.accept();
    }
    return Promise.resolve();
  }

  waitForDecision(): Promise<AlertVirtualSurfaceDecision> {
    return this.decisionPromise;
  }

  private accept(): void {
    if (this.accepted) return;
    this.accepted = true;
    this.resolveDecision({ type: 'accept' });
  }

  private async renderScreenshot(): Promise<string> {
    const { width, height } = this.viewportSize;
    const messageLines = wrapMessage(this.message || 'This page says', 56);
    const textLines = messageLines
      .map(
        (line, index) =>
          `<text x="${this.dialogRect.left + 28}" y="${
            this.dialogRect.top + 63 + index * 21
          }" font-size="14" fill="#5f6368">${escapeXml(line)}</text>`,
      )
      .join('');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <filter id="chrome-dialog-shadow" x="-15%" y="-20%" width="130%" height="145%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.32"/>
        </filter>
      </defs>
      <rect width="${width}" height="${height}" fill="#ffffff"/>
      <g filter="url(#chrome-dialog-shadow)">
        <rect x="${this.dialogRect.left}" y="${this.dialogRect.top}" width="${this.dialogRect.width}" height="${this.dialogRect.height}" rx="2" fill="#ffffff" stroke="#b8b8b8"/>
        <text x="${this.dialogRect.left + 16}" y="${this.dialogRect.top + 34}" font-family="Arial, sans-serif" font-size="15" fill="#111111">This page says</text>
        <g font-family="Arial, sans-serif">${textLines}</g>
        <rect x="${this.confirmRect.left}" y="${this.confirmRect.top}" width="${this.confirmRect.width}" height="${this.confirmRect.height}" rx="3" fill="#4285f4"/>
        <text x="${this.confirmRect.left + this.confirmRect.width / 2}" y="${this.confirmRect.top + 21}" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" fill="#ffffff">OK</text>
      </g>
    </svg>`;

    const jpeg = await convertImgBufferToJpeg(Buffer.from(svg), 92);
    return createImgBase64ByFormat('jpeg', jpeg.toString('base64'));
  }
}
