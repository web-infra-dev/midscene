import { IBenchCase, BenchCaseMeta } from '../../types/bench-runner';

export abstract class BenchCase implements IBenchCase {
  public result?: Record<string, any>;
  
  constructor(public meta: BenchCaseMeta) {}

  abstract isSuccessful(): boolean;

  public updateResult(res: Record<string, any>) {
    this.result = res;
  }
}

export class AudioRecorderCase extends BenchCase {
  isSuccessful(): boolean {
    // TODO: Implement hardcoded check logic
    return true; 
  }
}
