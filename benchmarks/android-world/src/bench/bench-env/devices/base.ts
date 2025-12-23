import { IBenchDevice } from '../../../types/bench-env';
import { Logger } from '../../../utils/logger';

/**
 * Base abstract class for all benchmark devices
 */
export abstract class BenchDevice implements IBenchDevice {
  protected logger = new Logger({ category: this.constructor.name });
  abstract setup(): Promise<boolean>;
  abstract getDeviceId(): string;
  abstract terminate(): Promise<boolean>;
}
