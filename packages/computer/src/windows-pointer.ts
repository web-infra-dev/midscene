export interface WindowsPointerPoint {
  x: number;
  y: number;
}

export interface WindowsPointerMoveOptions {
  smoothSteps?: number;
  smoothDelayMs?: number;
}

interface WindowsPointerDriverOptions {
  runPowershell(script: string): string;
}

export const WINDOWS_POINTER_TOLERANCE_PX = 5;

function assertFinitePoint(point: WindowsPointerPoint, context: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error(
      `${context} must contain finite coordinates, got (${point.x}, ${point.y})`,
    );
  }
}

function parseWindowsPointerPosition(
  output: string,
  context: string,
): WindowsPointerPoint {
  const match = output.trim().match(/^(-?\d+),(-?\d+)$/);
  if (!match) {
    throw new Error(
      `${context} returned an invalid cursor position: ${JSON.stringify(output.trim())}`,
    );
  }
  return { x: Number(match[1]), y: Number(match[2]) };
}

function windowsPointerPositionScript(): string {
  return `
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$position = [System.Windows.Forms.Cursor]::Position
[Console]::Out.Write(('{0},{1}' -f $position.X, $position.Y))
`.trim();
}

/** @internal exported for unit tests — do not consume from outside this package */
export function windowsPointerMoveScript(
  point: WindowsPointerPoint,
  options?: WindowsPointerMoveOptions,
): string {
  assertFinitePoint(point, 'Windows pointer target');
  if (
    (options?.smoothSteps !== undefined &&
      !Number.isFinite(options.smoothSteps)) ||
    (options?.smoothDelayMs !== undefined &&
      !Number.isFinite(options.smoothDelayMs))
  ) {
    throw new Error('Windows pointer smoothing options must be finite numbers');
  }
  const targetX = Math.round(point.x);
  const targetY = Math.round(point.y);
  const smoothSteps = Math.max(1, Math.round(options?.smoothSteps ?? 1));
  const smoothDelayMs = Math.max(0, Math.round(options?.smoothDelayMs ?? 0));

  return `
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$targetX = ${targetX}
$targetY = ${targetY}
$smoothSteps = ${smoothSteps}
$smoothDelayMs = ${smoothDelayMs}
$start = [System.Windows.Forms.Cursor]::Position
for ($step = 1; $step -le $smoothSteps; $step += 1) {
  $x = [int][Math]::Round($start.X + (($targetX - $start.X) * $step / [double]$smoothSteps))
  $y = [int][Math]::Round($start.Y + (($targetY - $start.Y) * $step / [double]$smoothSteps))
  [System.Windows.Forms.Cursor]::Position = [System.Drawing.Point]::new($x, $y)
  if ($smoothDelayMs -gt 0 -and $step -lt $smoothSteps) {
    Start-Sleep -Milliseconds $smoothDelayMs
  }
}
[System.Windows.Forms.Cursor]::Position = [System.Drawing.Point]::new($targetX, $targetY)
$position = [System.Windows.Forms.Cursor]::Position
[Console]::Out.Write(('{0},{1}' -f $position.X, $position.Y))
`.trim();
}

/**
 * Move and observe the Windows cursor through the same DPI-virtualized
 * WinForms coordinate space used by Screen.Bounds and CopyFromScreen.
 *
 * libnut's Windows implementation normalizes SendInput coordinates with the
 * host Node process metrics. On a scaled or mixed-DPI desktop, checking that
 * move with libnut.getMousePos only proves that the two native calls agree
 * with each other; it does not prove that the cursor overlays the screenshot
 * pixel selected by the model. Keeping capture, display geometry, movement,
 * and verification in WinForms removes that cross-process DPI mismatch.
 */
export class WindowsPointerDriver {
  constructor(private readonly options: WindowsPointerDriverOptions) {}

  getPosition(): WindowsPointerPoint {
    return parseWindowsPointerPosition(
      this.options.runPowershell(windowsPointerPositionScript()),
      'Windows pointer query',
    );
  }

  moveTo(
    point: WindowsPointerPoint,
    options?: WindowsPointerMoveOptions,
  ): WindowsPointerPoint {
    return parseWindowsPointerPosition(
      this.options.runPowershell(windowsPointerMoveScript(point, options)),
      'Windows pointer move',
    );
  }
}

export function windowsPointerDrift(
  expected: WindowsPointerPoint,
  actual: WindowsPointerPoint,
): WindowsPointerPoint {
  return {
    x: actual.x - expected.x,
    y: actual.y - expected.y,
  };
}

export function windowsPointerIsWithinTolerance(
  drift: WindowsPointerPoint,
): boolean {
  return (
    Math.abs(drift.x) <= WINDOWS_POINTER_TOLERANCE_PX &&
    Math.abs(drift.y) <= WINDOWS_POINTER_TOLERANCE_PX
  );
}
