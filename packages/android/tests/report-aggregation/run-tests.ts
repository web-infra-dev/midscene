import { spawn } from 'child_process';
const REPORT_AGGREGATION__SCRIPTS_DIR = './tests/report-aggregation'
async function runCommand(command: string, args: string[] = []) {
  return new Promise<boolean>((resolve) => {
    const [cmd, ...cmdArgs] = command.split(' ');
    const finalArgs = [...cmdArgs, ...args];
    const child = spawn(cmd, finalArgs, { stdio: 'inherit', shell: true });

    child.on('close', (code) => {
      resolve(code === 0);
    });

    child.on('error', (error) => {
      console.error(`[ERROR] run ${command} failed:`, error.message);
      resolve(false);
    });
  });
}

async function main() {
  // 1. run setup-test.ts
  const setupSuccess = await runCommand(`npx tsx ${REPORT_AGGREGATION__SCRIPTS_DIR}/setup-test.ts`);
  if (!setupSuccess) {
    console.error('fail to run setup-test.ts, abort process.');
    return;
  }

  // 2. run vitest（continue when failed）
  await runCommand(`vitest --run ${REPORT_AGGREGATION__SCRIPTS_DIR}/cases/`);
  console.log('Vitest done, run gather-reports.ts');


  // 3. run gather-report.ts
  await runCommand(`npx tsx ${REPORT_AGGREGATION__SCRIPTS_DIR}/gather-report.ts`);
}

main();