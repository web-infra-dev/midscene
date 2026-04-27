import type { ServiceDump } from './types';

export class ServiceError extends Error {
  dump: ServiceDump;

  constructor(message: string, dump: ServiceDump) {
    super(message);
    this.name = 'ServiceError';
    this.dump = dump;
  }
}
