import { runTestCli } from './cli/test-command';

void runTestCli(process.argv.slice(2)).then((exitCode) => {
  process.exitCode = exitCode;
});
