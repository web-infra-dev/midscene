import { IBenchObject } from '../../types/bench-object';
import { IBenchDevice } from '../../types/bench-env';
import { agentFromAdbDevice, AndroidAgent } from '@midscene/android';

/**
 * Abstract Base BenchObject
 */
export abstract class BenchObject implements IBenchObject {
  protected device: IBenchDevice;

  constructor(device: IBenchDevice) {
    this.device = device;
  }

  abstract step(options: { goal: string }): Promise<any>;
}

/**
 * Midscene implementation for Android Benchmark
 */
export class MidsceneBenchObject4Android extends BenchObject {
  private agentPromise: Promise<AndroidAgent>;

  constructor(device: IBenchDevice) {
    super(device);
    this.agentPromise = agentFromAdbDevice(this.device.getDeviceId());
  }

  async step(options: { goal: string }): Promise<any> {
    const agent = await this.agentPromise;
    const result = await agent.ai(options.goal);
    return result;
  }
}