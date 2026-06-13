import type { OutputStore, StepOutput } from '../types';

interface StoredOutput {
  node: string;
  index: number;
  output: StepOutput;
}

/**
 * Mutable backing store for step outputs. Exposes a read-only {@link OutputStore}
 * view to runtime nodes (RFC §3).
 */
export class OutputStoreImpl implements OutputStore {
  private readonly outputs: StoredOutput[] = [];

  add(node: string, index: number, output: StepOutput): void {
    this.outputs.push({ node, index, output });
  }

  all(): ReadonlyArray<StoredOutput> {
    return this.outputs;
  }

  latest(): StepOutput | undefined {
    return this.outputs[this.outputs.length - 1]?.output;
  }
}
