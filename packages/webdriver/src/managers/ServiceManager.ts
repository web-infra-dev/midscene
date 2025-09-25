export interface WebDriverServiceManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  isRunning(): boolean;
  getEndpoint(): string;
  getPort(): number;
  getHost(): string;
}

export abstract class BaseServiceManager implements WebDriverServiceManager {
  protected port: number;
  protected host: string;

  constructor(port: number, host = 'localhost') {
    this.port = port;
    this.host = host;
  }

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract isRunning(): boolean;

  async restart(): Promise<void> {
    if (this.isRunning()) {
      await this.stop();
    }
    await this.start();
  }

  getEndpoint(): string {
    return `http://${this.host}:${this.port}`;
  }

  getPort(): number {
    return this.port;
  }

  getHost(): string {
    return this.host;
  }
}
