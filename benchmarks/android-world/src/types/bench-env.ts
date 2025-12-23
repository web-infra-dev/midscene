export interface IBenchDevice {
  setup(): Promise<boolean>;
  getDeviceId(): string;
  terminate(): Promise<boolean>;
}

export interface IBenchEnvManager {
  registerDevice(name: string, device: IBenchDevice): void;
  activate(name: string): void;
  currentDevice(): IBenchDevice | undefined;
}
