import { getDebug } from '@midscene/shared/logger';
import { type UtilityProcess, utilityProcess } from 'electron';

const debugSidecar = getDebug('studio:platform-sidecar', { console: true });

export interface PlatformSidecarMessage {
  type: string;
}

export interface PlatformSidecarProcessOptions<
  StartMessage extends PlatformSidecarMessage,
  WorkerMessage extends PlatformSidecarMessage,
  CommandMessage extends PlatformSidecarMessage,
> {
  serviceName: string;
  workerPath: string;
  isReadyMessage(message: WorkerMessage): boolean;
  getErrorMessage?(message: WorkerMessage): string | undefined;
  onReady?(child: UtilityProcess): void;
  restartDelayMs?: number;
  startTimeoutMs?: number;
  stopMessage?: CommandMessage;
}

export class PlatformSidecarProcess<
  StartMessage extends PlatformSidecarMessage,
  WorkerMessage extends PlatformSidecarMessage,
  CommandMessage extends PlatformSidecarMessage = PlatformSidecarMessage,
> {
  private child: UtilityProcess | null = null;
  private closing = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private startMessage: StartMessage | null = null;

  constructor(
    private readonly options: PlatformSidecarProcessOptions<
      StartMessage,
      WorkerMessage,
      CommandMessage
    >,
  ) {}

  async start(message: StartMessage): Promise<void> {
    if (this.child || this.restartTimer) {
      await this.stop();
    }
    this.startMessage = message;
    this.closing = false;
    await this.spawnWorker(message);
  }

  postMessage(message: CommandMessage): void {
    this.child?.postMessage(message);
  }

  async stop(): Promise<void> {
    this.closing = true;
    this.startMessage = null;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;

    const child = this.child;
    this.child = null;
    if (!child) return;

    await new Promise<void>((resolve) => {
      let settled = false;
      let forceResolveTimer: ReturnType<typeof setTimeout> | null = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(forceKillTimer);
        if (forceResolveTimer) clearTimeout(forceResolveTimer);
        resolve();
      };
      const forceKillTimer = setTimeout(() => {
        child.kill();
        // Do not let a broken Electron child-process implementation block
        // runtime shutdown forever if it fails to emit `exit` after kill().
        forceResolveTimer = setTimeout(finish, 1_000);
        forceResolveTimer.unref();
      }, 2_000);
      forceKillTimer.unref();

      child.once('exit', finish);
      try {
        child.postMessage(this.options.stopMessage || { type: 'stop' });
      } catch (error) {
        debugSidecar(
          'failed to stop %s utility process gracefully: %s',
          this.options.serviceName,
          error,
        );
        child.kill();
      }
    });
  }

  private async spawnWorker(message: StartMessage): Promise<void> {
    const child = utilityProcess.fork(this.options.workerPath, [], {
      serviceName: this.options.serviceName,
    });
    this.child = child;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let ready = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        error ? reject(error) : resolve();
      };
      const failStartup = (error: Error) => {
        if (settled) return;
        if (this.child === child) this.child = null;
        finish(error);
        child.kill();
      };
      const timeout = setTimeout(() => {
        failStartup(
          new Error(
            `Timed out starting ${this.options.serviceName} utility process`,
          ),
        );
      }, this.options.startTimeoutMs ?? 20_000);

      child.on('message', (workerMessage: WorkerMessage) => {
        if (this.options.isReadyMessage(workerMessage)) {
          if (settled) return;
          ready = true;
          debugSidecar('%s utility process ready', this.options.serviceName);
          this.options.onReady?.(child);
          finish();
          return;
        }
        const errorMessage = this.options.getErrorMessage?.(workerMessage);
        if (!errorMessage) return;
        if (!ready) {
          failStartup(new Error(errorMessage));
          return;
        }
        debugSidecar(
          '%s utility process reported an error: %s',
          this.options.serviceName,
          errorMessage,
        );
        child.kill();
      });
      child.once('exit', (code) => {
        if (this.child === child) this.child = null;
        if (!ready) {
          finish(
            new Error(
              `${this.options.serviceName} utility process exited with code ${code}`,
            ),
          );
          return;
        }
        this.scheduleRestart();
      });
      child.postMessage(message);
    });
  }

  private scheduleRestart(): void {
    if (this.closing || !this.startMessage || this.restartTimer) return;
    debugSidecar(
      '%s utility process exited; scheduling restart',
      this.options.serviceName,
    );
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      const message = this.startMessage;
      if (this.closing || !message) return;
      void this.spawnWorker(message).catch((error) => {
        debugSidecar(
          'failed to restart %s utility process: %s',
          this.options.serviceName,
          error,
        );
        this.scheduleRestart();
      });
    }, this.options.restartDelayMs ?? 1_000);
    this.restartTimer.unref();
  }
}
