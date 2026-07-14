import { runWorkflowCli } from './cli/workflow-command';

void runWorkflowCli(process.argv.slice(2)).then((exitCode) => {
  process.exitCode = exitCode;
});
