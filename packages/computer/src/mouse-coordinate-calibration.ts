export interface MousePoint {
  x: number;
  y: number;
}

export interface MouseCalibrationBounds extends MousePoint {
  width: number;
  height: number;
}

export interface MouseCoordinateCalibration {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
}

export const MOUSE_COORDINATE_TOLERANCE_PX = 5;

const MIN_CALIBRATION_AXIS_DELTA = 20;
const MIN_VALID_CALIBRATION_SCALE = 0.1;
const MAX_VALID_CALIBRATION_SCALE = 10;

export function assertValidMouseCalibrationBounds(
  bounds: MouseCalibrationBounds,
): void {
  if (
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    throw new Error(
      `Mouse calibration bounds are invalid: (${bounds.x}, ${bounds.y}, ${bounds.width}, ${bounds.height})`,
    );
  }
}

export function mouseCalibrationPoint(
  bounds: MouseCalibrationBounds,
  ratio: number,
): MousePoint {
  return {
    x: Math.round(bounds.x + bounds.width * ratio),
    y: Math.round(bounds.y + bounds.height * ratio),
  };
}

/** @internal exported for unit tests — do not consume from outside this package */
export function calculateMouseCoordinateCalibration(
  firstInput: MousePoint,
  firstActual: MousePoint,
  secondInput: MousePoint,
  secondActual: MousePoint,
): MouseCoordinateCalibration {
  const inputDeltaX = secondInput.x - firstInput.x;
  const inputDeltaY = secondInput.y - firstInput.y;
  if (
    Math.abs(inputDeltaX) < MIN_CALIBRATION_AXIS_DELTA ||
    Math.abs(inputDeltaY) < MIN_CALIBRATION_AXIS_DELTA
  ) {
    throw new Error(
      `Mouse calibration points are too close: delta=(${inputDeltaX}, ${inputDeltaY})`,
    );
  }

  const scaleX = (secondActual.x - firstActual.x) / inputDeltaX;
  const scaleY = (secondActual.y - firstActual.y) / inputDeltaY;
  if (
    !Number.isFinite(scaleX) ||
    !Number.isFinite(scaleY) ||
    scaleX < MIN_VALID_CALIBRATION_SCALE ||
    scaleY < MIN_VALID_CALIBRATION_SCALE ||
    scaleX > MAX_VALID_CALIBRATION_SCALE ||
    scaleY > MAX_VALID_CALIBRATION_SCALE
  ) {
    throw new Error(
      `Mouse calibration produced invalid scale: (${scaleX}, ${scaleY})`,
    );
  }

  return {
    scaleX,
    scaleY,
    offsetX: firstActual.x - scaleX * firstInput.x,
    offsetY: firstActual.y - scaleY * firstInput.y,
  };
}

/** @internal exported for unit tests — do not consume from outside this package */
export function applyMouseCoordinateCalibration(
  point: MousePoint,
  calibration: MouseCoordinateCalibration,
): MousePoint {
  return {
    x: Math.round((point.x - calibration.offsetX) / calibration.scaleX),
    y: Math.round((point.y - calibration.offsetY) / calibration.scaleY),
  };
}

export function mouseCoordinateCalibrationNeedsCorrection(
  calibration: MouseCoordinateCalibration,
): boolean {
  return (
    Math.abs(calibration.scaleX - 1) > 0.01 ||
    Math.abs(calibration.scaleY - 1) > 0.01 ||
    Math.abs(calibration.offsetX) > MOUSE_COORDINATE_TOLERANCE_PX ||
    Math.abs(calibration.offsetY) > MOUSE_COORDINATE_TOLERANCE_PX
  );
}

export function getMouseCoordinateDrift(
  expected: MousePoint,
  actual: MousePoint,
): MousePoint {
  return {
    x: actual.x - expected.x,
    y: actual.y - expected.y,
  };
}
