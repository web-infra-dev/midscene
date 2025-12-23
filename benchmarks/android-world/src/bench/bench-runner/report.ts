import { BenchSuite } from './suite';

export class BenchReport {
  private suites: Record<string, BenchSuite> = {};

  constructor(private customReporterFn?: (suite: BenchSuite) => string) {}

  registerSuite(suite: BenchSuite) {
    this.suites[suite.name] = suite;
  }

  generateReport() {
    const reporterFn = this.customReporterFn ?? this.defaultReporterFn;
    for(const suite of Object.values(this.suites)) {
        console.log(reporterFn(suite));
    }
  }

  private defaultReporterFn(suite: BenchSuite): string {
    return `Suite: ${suite.name}, Cases: ${Object.keys(suite.benchCases).length}`;
  }
}
