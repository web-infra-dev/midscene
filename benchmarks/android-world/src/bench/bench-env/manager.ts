import { IBenchDevice, IBenchEnvManager } from '../../types/bench-env';

export class BenchEnvManager implements IBenchEnvManager {
  private deviceRecord: Record<string, IBenchDevice> = {};
  private activeDeviceName: string | null = null;

  registerDevice(name: string, device: IBenchDevice): void {
    this.deviceRecord[name] = device;
  }

  activate(name: string): void {
    if (this.deviceRecord[name]) {
      this.activeDeviceName = name;
      console.log(`Activated device: ${name}`);
    } else {
      throw new Error(`Device not found: ${name}`);
    }
  }

  currentDevice(): IBenchDevice | undefined {
    if (this.activeDeviceName) {
      return this.deviceRecord[this.activeDeviceName];
    }
    return undefined;
  }
}
