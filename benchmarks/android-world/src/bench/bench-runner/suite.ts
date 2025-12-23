import { BenchCase } from './case';
import { IBenchObject } from '../../types/bench-object';

export class BenchSuite {
  public benchCases: Record<string, BenchCase> = {};

  constructor(public name: string, private benchObject: IBenchObject) {}

  registerCase(kase: BenchCase) {
    this.benchCases[kase.meta.name] = kase;
  }

  async run() {
    for (let item of Object.values(this.benchCases)) {
      await this.executeBenchTask(item);
    }
  }

  async executeBenchTask(kase: BenchCase) {
    let startTime: number = Date.now();
    let steps = 1;

    while (steps <= kase.meta.optimalSteps) {
      const res = await this.benchObject.step({ goal: kase.meta.template });
      
      // Update result temporarily or use it for check
      kase.updateResult({
        output: res
      });

      if (kase.isSuccessful()) {
        kase.updateResult({
          success: true,
          steps,
          time: Date.now() - startTime,
          output: res
        });
        return;
      }
      steps++;
    }

    kase.updateResult({
      success: false,
      output: kase.result?.output // keep last output
    });
  }
}
