import { runCli } from './run-cli';

void runCli()
  .then(({ exitCode, termination }) => {
    if (termination === 'force') {
      process.exit(exitCode);
    } else {
      process.exitCode = exitCode;
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
