/**
 * Minimal counting semaphore.
 *
 * Each rish call spawns a fresh process; a car head unit cannot absorb an
 * unbounded number of them. Transports cap in-flight commands and queue the
 * rest instead of failing.
 */
export class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error(
        `Semaphore limit must be a positive integer, got: ${limit}`,
      );
    }
  }

  get activeCount(): number {
    return this.active;
  }

  get pendingCount(): number {
    return this.waiters.length;
  }

  async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active += 1;
      return;
    }

    // Resolved when another holder hands its slot over; `active` is unchanged.
    await new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  release(): void {
    const next = this.waiters.shift();
    if (next) {
      next();
      return;
    }

    if (this.active > 0) {
      this.active -= 1;
    }
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }
}
