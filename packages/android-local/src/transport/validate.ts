import { AndroidTransportError } from './errors';
import type { TransportBackend } from './types';

/** Guards used by transports so every backend rejects bad input identically. */

function invalidArgument(
  message: string,
  backend: TransportBackend,
): AndroidTransportError {
  return new AndroidTransportError(message, {
    code: 'InvalidArgument',
    backend,
  });
}

export function assertFiniteNumber(
  value: number,
  name: string,
  backend: TransportBackend,
): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalidArgument(`${name} must be a finite number`, backend);
  }
}

export function assertNonNegativeInteger(
  value: number,
  name: string,
  backend: TransportBackend,
): void {
  assertFiniteNumber(value, name, backend);
  if (!Number.isInteger(value) || value < 0) {
    throw invalidArgument(`${name} must be a non-negative integer`, backend);
  }
}

export function assertPositiveInteger(
  value: number,
  name: string,
  backend: TransportBackend,
): void {
  assertFiniteNumber(value, name, backend);
  if (!Number.isInteger(value) || value <= 0) {
    throw invalidArgument(`${name} must be a positive integer`, backend);
  }
}

export function assertDisplayId(
  value: number | undefined,
  backend: TransportBackend,
): void {
  if (value === undefined) {
    return;
  }

  assertNonNegativeInteger(value, 'displayId', backend);
}

export function assertNonEmptyString(
  value: string,
  name: string,
  backend: TransportBackend,
): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw invalidArgument(`${name} must be a non-empty string`, backend);
  }
}

export function assertPoint(
  point: { x: number; y: number },
  name: string,
  backend: TransportBackend,
): void {
  if (!point || typeof point !== 'object') {
    throw invalidArgument(`${name} must be a point object`, backend);
  }

  assertFiniteNumber(point.x, `${name}.x`, backend);
  assertFiniteNumber(point.y, `${name}.y`, backend);
}
