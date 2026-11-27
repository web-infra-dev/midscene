import { iosScreenText } from '../i18n/ios-screen';
import type { Locale } from '../i18n/translations';

export type IOSPage = 'home' | 'settings' | 'general';

export interface HitTarget {
  id: string;
  label: string;
  nx: number;
  ny: number;
  w: number;
  h: number;
}

export interface ScreenOverlay {
  mode: 'locate' | 'tap' | 'swipe';
  nx: number;
  ny: number;
  nx2?: number;
  ny2?: number;
  progress: number;
  label?: string;
}

function roundPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawSquircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  fill: string | CanvasGradient,
): void {
  const r = size * 0.235;
  ctx.fillStyle = fill;
  roundPath(ctx, cx - size / 2, cy - size / 2, size, size, r);
  ctx.fill();
}

function drawPhotosIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
): void {
  drawSquircle(ctx, cx, cy, s, '#ffffff');
  const colors = [
    '#ef4444',
    '#f97316',
    '#eab308',
    '#22c55e',
    '#06b6d4',
    '#3b82f6',
    '#8b5cf6',
    '#ec4899',
  ];
  ctx.save();
  ctx.translate(cx, cy);
  colors.forEach((c, i) => {
    ctx.save();
    ctx.rotate((i * Math.PI) / 4);
    ctx.fillStyle = c;
    ctx.globalAlpha = 0.86;
    roundPath(ctx, -7.5, -s * 0.36, 15, s * 0.28, 7.5);
    ctx.fill();
    ctx.restore();
  });
  ctx.restore();
}

function drawSettingsIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
): void {
  const grad = ctx.createLinearGradient(cx, cy - s / 2, cx, cy + s / 2);
  grad.addColorStop(0, '#8e8e93');
  grad.addColorStop(1, '#555558');
  drawSquircle(ctx, cx, cy, s, grad);
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < 12; i += 1) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 6);
    ctx.fillStyle = '#e5e5ea';
    ctx.fillRect(-4.5, -s * 0.35, 9, s * 0.12);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.27, 0, Math.PI * 2);
  ctx.fillStyle = '#e5e5ea';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.15, 0, Math.PI * 2);
  ctx.fillStyle = '#636366';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.08, 0, Math.PI * 2);
  ctx.fillStyle = '#1c1c1e';
  ctx.fill();
  ctx.restore();
}

function drawFilesIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
): void {
  drawSquircle(ctx, cx, cy, s, '#ffffff');
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#3b82f6';
  roundPath(ctx, -s * 0.34, -s * 0.16, s * 0.68, s * 0.44, 10);
  ctx.fill();
  roundPath(ctx, -s * 0.34, -s * 0.25, s * 0.3, s * 0.14, 6);
  ctx.fill();
  ctx.fillStyle = '#60a5fa';
  roundPath(ctx, -s * 0.34, -s * 0.08, s * 0.68, s * 0.36, 10);
  ctx.fill();
  ctx.restore();
}

function drawClockIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
): void {
  drawSquircle(ctx, cx, cy, s, '#1c1c1e');
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.39, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-s * 0.14, -s * 0.14);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(s * 0.21, -s * 0.18);
  ctx.stroke();
  ctx.strokeStyle = '#f4f4f5';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, s * 0.27);
  ctx.stroke();
  ctx.restore();
}

function drawMusicIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
): void {
  const grad = ctx.createLinearGradient(cx, cy - s / 2, cx, cy + s / 2);
  grad.addColorStop(0, '#fb7185');
  grad.addColorStop(1, '#e11d48');
  drawSquircle(ctx, cx, cy, s, grad);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-s * 0.12, -s * 0.22, s * 0.28, 9);
  ctx.fillRect(-s * 0.12, -s * 0.22, 7, s * 0.35);
  ctx.fillRect(s * 0.1, -s * 0.22, 7, s * 0.31);
  ctx.beginPath();
  ctx.arc(-s * 0.15, s * 0.15, 9.5, 0, Math.PI * 2);
  ctx.arc(s * 0.07, s * 0.11, 9.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMapsIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
): void {
  const grad = ctx.createLinearGradient(cx, cy - s / 2, cx, cy + s / 2);
  grad.addColorStop(0, '#34d399');
  grad.addColorStop(1, '#059669');
  drawSquircle(ctx, cx, cy, s, grad);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, -s * 0.06, s * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-s * 0.17, 0);
  ctx.lineTo(0, s * 0.28);
  ctx.lineTo(s * 0.17, 0);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -s * 0.06, s * 0.08, 0, Math.PI * 2);
  ctx.fillStyle = '#059669';
  ctx.fill();
  ctx.restore();
}

function drawNotesIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
): void {
  drawSquircle(ctx, cx, cy, s, '#ffffff');
  ctx.save();
  roundPath(ctx, cx - s / 2, cy - s / 2, s, s, s * 0.235);
  ctx.clip();
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(cx - s / 2, cy - s / 2, s, s * 0.28);
  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 2.5;
  for (let i = 1; i <= 3; i += 1) {
    const y = cy - s / 2 + s * (0.3 + i * 0.17);
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.34, y);
    ctx.lineTo(cx + s * 0.34, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCalendarIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
): void {
  drawSquircle(ctx, cx, cy, s, '#ffffff');
  ctx.save();
  roundPath(ctx, cx - s / 2, cy - s / 2, s, s, s * 0.235);
  ctx.clip();
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(cx - s / 2, cy - s / 2, s, s * 0.26);
  ctx.restore();
  ctx.fillStyle = '#111827';
  ctx.font = '500 50px -apple-system, Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('13', cx, cy + s * 0.24);
}

function drawMailIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
): void {
  const grad = ctx.createLinearGradient(cx, cy - s / 2, cx, cy + s / 2);
  grad.addColorStop(0, '#38bdf8');
  grad.addColorStop(1, '#2563eb');
  drawSquircle(ctx, cx, cy, s, grad);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#ffffff';
  roundPath(ctx, -s * 0.32, -s * 0.2, s * 0.64, s * 0.4, 8);
  ctx.fill();
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-s * 0.3, -s * 0.18);
  ctx.lineTo(0, s * 0.04);
  ctx.lineTo(s * 0.3, -s * 0.18);
  ctx.stroke();
  ctx.restore();
}

function drawRemindersIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
): void {
  drawSquircle(ctx, cx, cy, s, '#ffffff');
  const dots = ['#ef4444', '#3b82f6', '#f59e0b'];
  dots.forEach((c, i) => {
    const y = cy - s * 0.22 + i * s * 0.22;
    ctx.beginPath();
    ctx.arc(cx - s * 0.24, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
    ctx.fillStyle = '#d1d5db';
    roundPath(ctx, cx - s * 0.08, y - 4, s * 0.4, 8, 4);
    ctx.fill();
  });
}

function drawWeatherIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
): void {
  const grad = ctx.createLinearGradient(cx, cy - s / 2, cx, cy + s / 2);
  grad.addColorStop(0, '#38bdf8');
  grad.addColorStop(1, '#0284c7');
  drawSquircle(ctx, cx, cy, s, grad);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.arc(s * 0.12, -s * 0.08, s * 0.16, 0, Math.PI * 2);
  ctx.fillStyle = '#fbbf24';
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-s * 0.08, s * 0.08, s * 0.16, 0, Math.PI * 2);
  ctx.arc(s * 0.08, s * 0.1, s * 0.14, 0, Math.PI * 2);
  ctx.arc(-s * 0.2, s * 0.12, s * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawWalletIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
): void {
  drawSquircle(ctx, cx, cy, s, '#1c1c1e');
  const bands = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444'];
  bands.forEach((c, i) => {
    ctx.fillStyle = c;
    roundPath(ctx, cx - s * 0.34, cy - s * 0.26 + i * 11, s * 0.68, 22, 6);
    ctx.fill();
  });
  ctx.fillStyle = '#27272a';
  roundPath(ctx, cx - s * 0.34, cy - s * 0.02, s * 0.68, s * 0.3, 8);
  ctx.fill();
}

function drawPhoneIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
): void {
  const grad = ctx.createLinearGradient(cx, cy - s / 2, cx, cy + s / 2);
  grad.addColorStop(0, '#4ade80');
  grad.addColorStop(1, '#16a34a');
  drawSquircle(ctx, cx, cy, s, grad);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = '#ffffff';
  roundPath(ctx, -s * 0.14, -s * 0.26, s * 0.28, s * 0.52, 12);
  ctx.fill();
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(s * 0.02, -s * 0.14, s * 0.14, s * 0.28);
  ctx.restore();
}

function drawMessagesIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
): void {
  const grad = ctx.createLinearGradient(cx, cy - s / 2, cx, cy + s / 2);
  grad.addColorStop(0, '#4ade80');
  grad.addColorStop(1, '#16a34a');
  drawSquircle(ctx, cx, cy, s, grad);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(0, -2, s * 0.3, s * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-s * 0.14, s * 0.16);
  ctx.lineTo(-s * 0.26, s * 0.28);
  ctx.lineTo(-s * 0.02, s * 0.2);
  ctx.fill();
  ctx.restore();
}

function drawSafariIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
): void {
  const grad = ctx.createLinearGradient(cx, cy - s / 2, cx, cy + s / 2);
  grad.addColorStop(0, '#38bdf8');
  grad.addColorStop(1, '#1d4ed8');
  drawSquircle(ctx, cx, cy, s, '#ffffff');
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.rotate(-Math.PI / 4);
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.3);
  ctx.lineTo(s * 0.08, 0);
  ctx.lineTo(-s * 0.08, 0);
  ctx.closePath();
  ctx.fillStyle = '#ef4444';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, s * 0.3);
  ctx.lineTo(s * 0.08, 0);
  ctx.lineTo(-s * 0.08, 0);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}

function drawCameraIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
): void {
  const grad = ctx.createLinearGradient(cx, cy - s / 2, cx, cy + s / 2);
  grad.addColorStop(0, '#a1a1aa');
  grad.addColorStop(1, '#71717a');
  drawSquircle(ctx, cx, cy, s, grad);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#18181b';
  roundPath(ctx, -s * 0.32, -s * 0.18, s * 0.64, s * 0.4, 9);
  ctx.fill();
  roundPath(ctx, -s * 0.12, -s * 0.26, s * 0.24, s * 0.1, 4);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, s * 0.02, s * 0.13, 0, Math.PI * 2);
  ctx.fillStyle = '#3f3f46';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, s * 0.02, s * 0.08, 0, Math.PI * 2);
  ctx.fillStyle = '#09090b';
  ctx.fill();
  ctx.restore();
}

interface SettingRow {
  label: string;
  value?: string;
  toggle?: boolean;
  on?: boolean;
  chevron?: boolean;
}

export class IOSScreenEngine {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  page: IOSPage = 'home';
  scrollY = 0;
  bluetoothOn = true;
  wifiOn = true;
  overlay: ScreenOverlay | null = null;
  onChange: ((canvas: HTMLCanvasElement) => void) | null = null;
  private readonly logoImg: HTMLImageElement;

  private readonly text: (typeof iosScreenText)[Locale];

  constructor(locale: Locale) {
    this.text = iosScreenText[locale];
    this.canvas = document.createElement('canvas');
    this.canvas.width = 780;
    this.canvas.height = 1688;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;

    this.logoImg = new Image();
    this.logoImg.onload = () => this.render();
    this.logoImg.src = '/images/brand/midscene-icon.png';

    this.render();
  }

  getHitTargets(): HitTarget[] {
    const H = this.canvas.height;
    const W = this.canvas.width;
    if (this.page === 'home') {
      return [
        {
          id: 'settings',
          label: this.text.settings,
          nx: 0.39,
          ny: 0.355,
          w: 0.2,
          h: 0.1,
        },
        {
          id: 'back_home',
          label: this.text.home,
          nx: 0.5,
          ny: 0.975,
          w: 0.4,
          h: 0.05,
        },
      ];
    }
    if (this.page === 'settings') {
      const sy = this.scrollY;
      const wifiY = (424 + 49) / H - sy;
      const btY = (424 + 98 + 49) / H - sy;
      const btX = (44 + (W - 88) - 32 - 47) / W;
      const genY = (790 + 49) / H - sy;
      return [
        {
          id: 'back_home',
          label: this.text.home,
          nx: 0.5,
          ny: 0.975,
          w: 0.4,
          h: 0.05,
        },
        { id: 'wifi', label: 'Wi-Fi', nx: 0.5, ny: wifiY, w: 0.88, h: 0.058 },
        {
          id: 'bluetooth',
          label: this.text.bluetooth,
          nx: btX,
          ny: btY,
          w: 0.22,
          h: 0.058,
        },
        {
          id: 'general',
          label: this.text.general,
          nx: 0.5,
          ny: genY,
          w: 0.88,
          h: 0.058,
        },
      ];
    }
    if (this.page === 'general') {
      return [
        {
          id: 'back_settings',
          label: this.text.settings,
          nx: 0.14,
          ny: 166 / H,
          w: 0.26,
          h: 0.05,
        },
        {
          id: 'back_home',
          label: this.text.home,
          nx: 0.5,
          ny: 0.975,
          w: 0.4,
          h: 0.05,
        },
      ];
    }
    return [];
  }

  getTargetCenter(id: string): { nx: number; ny: number } {
    const found = this.getHitTargets().find((t) => t.id === id);
    return found ? { nx: found.nx, ny: found.ny } : { nx: 0.5, ny: 0.5 };
  }

  setScrollY(val: number): void {
    this.scrollY = Math.max(0, Math.min(0.18, val));
    this.render();
  }

  applyTap(nx: number, ny: number): void {
    if (ny > 0.93) {
      this.page = 'home';
      this.scrollY = 0;
      this.render();
      return;
    }

    const targets = this.getHitTargets();
    for (const t of targets) {
      if (Math.abs(nx - t.nx) <= t.w / 2 && Math.abs(ny - t.ny) <= t.h / 2) {
        if (t.id === 'settings') {
          this.page = 'settings';
          this.scrollY = 0;
        } else if (t.id === 'general') {
          this.page = 'general';
          this.scrollY = 0;
        } else if (t.id === 'bluetooth') {
          this.bluetoothOn = !this.bluetoothOn;
        } else if (t.id === 'wifi') {
          this.wifiOn = !this.wifiOn;
        } else if (t.id === 'back_settings') {
          this.page = 'settings';
          this.scrollY = 0;
        } else if (t.id === 'back_home') {
          this.page = 'home';
          this.scrollY = 0;
        }
        break;
      }
    }
    this.render();
  }

  setOverlay(overlay: ScreenOverlay | null): void {
    this.overlay = overlay;
    this.render();
  }

  render(): void {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    ctx.clearRect(0, 0, W, H);

    if (this.page === 'home') {
      this.drawHome(ctx, W, H);
    } else if (this.page === 'settings') {
      this.drawSettings(ctx, W, H);
    } else {
      this.drawGeneral(ctx, W, H);
    }

    this.drawChrome(ctx, W, H);
    if (this.overlay) this.drawOverlay(ctx, W, H);

    if (this.onChange) this.onChange(this.canvas);
  }

  private drawChrome(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
  ): void {
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 31px -apple-system, BlinkMacSystemFont, Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('9:41', 64, 76);

    const rx = W - 154;
    ctx.fillStyle = '#ffffff';
    [10, 14, 19, 24].forEach((h, i) => {
      roundPath(ctx, rx + i * 8.5, 76 - h, 5, h, 2);
      ctx.fill();
    });

    const wx = rx + 50;
    const wy = 75;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    [7, 13, 19].forEach((r) => {
      ctx.beginPath();
      ctx.arc(wx, wy, r, -Math.PI * 0.78, -Math.PI * 0.22);
      ctx.stroke();
    });

    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2.5;
    roundPath(ctx, rx + 76, 56, 44, 21, 6);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    roundPath(ctx, rx + 79, 59, 36, 15, 3);
    ctx.fill();
    ctx.fillRect(rx + 122, 63, 3, 7);

    ctx.fillStyle = '#020204';
    roundPath(ctx, W / 2 - 110, 38, 220, 62, 31);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.52)';
    roundPath(ctx, W / 2 - 125, H - 30, 250, 9, 4.5);
    ctx.fill();
  }

  private drawHome(ctx: CanvasRenderingContext2D, W: number, H: number): void {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#121728');
    bg.addColorStop(0.55, '#191a26');
    bg.addColorStop(0.85, '#2b1314');
    bg.addColorStop(1, '#140b0d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const warmGlow = ctx.createRadialGradient(
      W * 0.6,
      H * 0.78,
      20,
      W * 0.6,
      H * 0.78,
      420,
    );
    warmGlow.addColorStop(0, 'rgba(220, 72, 42, 0.28)');
    warmGlow.addColorStop(1, 'rgba(220, 72, 42, 0)');
    ctx.fillStyle = warmGlow;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundPath(ctx, 56, 152, W - 112, 166, 36);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.font = '400 23px -apple-system, PingFang SC, sans-serif';
    ctx.fillText(this.text.date, 92, 206);

    ctx.fillStyle = '#ffffff';
    ctx.font = '600 38px -apple-system, PingFang SC, sans-serif';
    ctx.fillText(this.text.weatherSummary, 92, 272);

    ctx.beginPath();
    ctx.arc(W - 122, 224, 28, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.fillStyle = '#e5e7eb';
    ctx.beginPath();
    ctx.arc(W - 144, 248, 26, 0, Math.PI * 2);
    ctx.arc(W - 114, 250, 22, 0, Math.PI * 2);
    ctx.arc(W - 166, 252, 18, 0, Math.PI * 2);
    ctx.fill();

    const s = 128;
    const cols = [0.175, 0.39, 0.61, 0.825];
    const rows = [0.355, 0.495, 0.635];
    const grid = [
      { label: this.text.photos, c: 0, r: 0, draw: drawPhotosIcon },
      { label: this.text.settings, c: 1, r: 0, draw: drawSettingsIcon },
      { label: this.text.files, c: 2, r: 0, draw: drawFilesIcon },
      { label: this.text.clock, c: 3, r: 0, draw: drawClockIcon },
      { label: this.text.music, c: 0, r: 1, draw: drawMusicIcon },
      { label: this.text.maps, c: 1, r: 1, draw: drawMapsIcon },
      { label: this.text.notes, c: 2, r: 1, draw: drawNotesIcon },
      { label: this.text.calendar, c: 3, r: 1, draw: drawCalendarIcon },
      { label: this.text.mail, c: 0, r: 2, draw: drawMailIcon },
      { label: this.text.reminders, c: 1, r: 2, draw: drawRemindersIcon },
      { label: this.text.weather, c: 2, r: 2, draw: drawWeatherIcon },
      { label: this.text.wallet, c: 3, r: 2, draw: drawWalletIcon },
    ];

    for (const item of grid) {
      const cx = cols[item.c] * W;
      const cy = rows[item.r] * H;
      item.draw(ctx, cx, cy, s);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = '400 22px -apple-system, PingFang SC, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(item.label, cx, cy + s / 2 + 30);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    roundPath(ctx, 38, H - 224, W - 76, 162, 48);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const dockDraws = [
      drawPhoneIcon,
      drawMessagesIcon,
      drawSafariIcon,
      drawCameraIcon,
    ];
    dockDraws.forEach((fn, i) => {
      const cx = cols[i] * W;
      const cy = H - 143;
      fn(ctx, cx, cy, 124);
    });
  }

  private drawSettings(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
  ): void {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);

    const offsetPx = -this.scrollY * H;
    ctx.save();
    ctx.translate(0, offsetPx);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 62px -apple-system, PingFang SC, sans-serif';
    ctx.fillText(this.text.settings, 48, 210);

    ctx.fillStyle = '#1c1c1e';
    roundPath(ctx, 44, 250, W - 88, 134, 24);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(114, 317, 42, 0, Math.PI * 2);
    ctx.fillStyle = '#f2f2f7';
    ctx.fill();
    ctx.clip();
    if (this.logoImg.complete && this.logoImg.naturalWidth > 0) {
      ctx.drawImage(this.logoImg, 114 - 34, 317 - 34, 68, 68);
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(114, 317, 42, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 32px -apple-system, PingFang SC, sans-serif';
    ctx.fillText('Midscene.js', 178, 308);
    ctx.fillStyle = '#8e8e93';
    ctx.font = '400 24px -apple-system, PingFang SC, sans-serif';
    ctx.fillText(this.text.accountSubtitle, 178, 346);

    this.drawGroup(ctx, 44, 424, W - 88, [
      {
        label: this.text.wifi,
        value: this.wifiOn ? 'Office-5G' : this.text.off,
      },
      { label: this.text.bluetooth, toggle: true, on: this.bluetoothOn },
      { label: this.text.cellular, value: '5G' },
    ]);

    this.drawGroup(ctx, 44, 790, W - 88, [
      { label: this.text.general, chevron: true },
      { label: this.text.controlCenter, chevron: true },
      { label: this.text.display, chevron: true },
      { label: this.text.homeScreen, chevron: true },
      { label: this.text.accessibility, chevron: true },
    ]);

    this.drawGroup(ctx, 44, 1340, W - 88, [
      { label: this.text.privacy, chevron: true },
      { label: this.text.passwords, chevron: true },
      { label: this.text.developerMode, value: this.text.off },
    ]);

    ctx.restore();

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, 118);
  }

  private drawGeneral(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
  ): void {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#3b82f6';
    ctx.font = '500 32px -apple-system, PingFang SC, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`‹ ${this.text.settings}`, 44, 174);

    ctx.fillStyle = '#ffffff';
    ctx.font = '600 34px -apple-system, PingFang SC, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.text.general, W / 2, 174);
    ctx.textAlign = 'left';

    this.drawGroup(ctx, 44, 230, W - 88, [
      { label: this.text.about, chevron: true },
      { label: this.text.softwareUpdate, value: 'iOS 18.2', chevron: true },
    ]);

    this.drawGroup(ctx, 44, 480, W - 88, [
      { label: this.text.airDrop, chevron: true },
      { label: this.text.airPlay, chevron: true },
      { label: this.text.pictureInPicture, chevron: true },
      { label: this.text.storage, chevron: true },
    ]);

    this.drawGroup(ctx, 44, 930, W - 88, [
      { label: this.text.dateTime, chevron: true },
      { label: this.text.keyboard, chevron: true },
      { label: this.text.reset, chevron: true },
    ]);
  }

  private drawGroup(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    rows: SettingRow[],
  ): void {
    const rowH = 98;
    ctx.fillStyle = '#1c1c1e';
    roundPath(ctx, x, y, w, rows.length * rowH, 24);
    ctx.fill();

    rows.forEach((row, i) => {
      const cy = y + i * rowH + rowH / 2;
      ctx.fillStyle = '#ffffff';
      ctx.font = '400 30px -apple-system, PingFang SC, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(row.label, x + 32, cy);

      if (row.toggle) {
        const tw = 94;
        const th = 54;
        const tx = x + w - 32 - tw;
        const ty = cy - th / 2;
        ctx.fillStyle = row.on ? '#34c759' : '#39393d';
        roundPath(ctx, tx, ty, tw, th, th / 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(row.on ? tx + tw - 27 : tx + 27, cy, 22, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      } else {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#8e8e93';
        ctx.font = '400 28px -apple-system, PingFang SC, sans-serif';
        const rightX = x + w - (row.chevron ? 64 : 32);
        if (row.value) ctx.fillText(row.value, rightX, cy);
        if (row.chevron) {
          ctx.fillStyle = '#636366';
          ctx.font = '600 34px -apple-system, sans-serif';
          ctx.fillText('›', x + w - 30, cy - 2);
        }
      }
      ctx.textBaseline = 'alphabetic';

      if (i < rows.length - 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(x + 32, y + (i + 1) * rowH, w - 32, 1.5);
      }
    });
  }

  private drawOverlay(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
  ): void {
    if (!this.overlay) return;
    const { mode, nx, ny, nx2, ny2, progress } = this.overlay;
    const cx = nx * W;
    const cy = ny * H;

    ctx.save();
    if (mode === 'locate') {
      ctx.strokeStyle = '#f4f4f5';
      ctx.lineWidth = 4;
      ctx.setLineDash([12, 8]);
      roundPath(ctx, cx - 72, cy - 48, 144, 96, 18);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (mode === 'tap') {
      const r = 18 + progress * 92;
      const alpha = Math.max(0, 1 - progress);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(244, 244, 245, ${alpha})`;
      ctx.lineWidth = 6;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(228, 228, 231, ${alpha * 0.45})`;
      ctx.fill();
    } else if (mode === 'swipe') {
      const ex = (nx2 ?? nx) * W;
      const ey = (ny2 ?? ny) * H;
      const curX = cx + (ex - cx) * progress;
      const curY = cy + (ey - cy) * progress;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(curX, curY);
      ctx.strokeStyle = 'rgba(244, 244, 245, 0.85)';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(curX, curY, 18, 0, Math.PI * 2);
      ctx.fillStyle = '#f4f4f5';
      ctx.fill();
    }
    ctx.restore();
  }
}
