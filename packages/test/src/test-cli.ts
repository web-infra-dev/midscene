import { writeGitHubSummary } from './cli/github-reporter';
import { runTestCli } from './cli/test-command';

void runTestCli(process.argv.slice(2), undefined, writeGitHubSummary).then(
  (exitCode) => {
    process.exitCode = exitCode;
  },
);
