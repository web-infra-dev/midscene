import { runCli } from './run-cli';

void runCli()
  .then(({ exitCode, keepAlive }) => {
    if (keepAlive) {
      process.exitCode = exitCode;
    } else {
      process.exit(exitCode);
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
