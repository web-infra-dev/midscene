import c, { disableDefaultColors } from 'tinyrainbow';
import { version } from '../package.json';

if (
  (!process.stdout.isTTY && !('FORCE_COLOR' in process.env)) ||
  ['0', 'false'].includes(process.env.FORCE_COLOR ?? '')
)
  disableDefaultColors();

export const write = (...lines: string[]) =>
  process.stdout.write(`${lines.join('\n')}\n`);

export const formatDuration = (value?: number | null) =>
  value === undefined || value === null
    ? '—'
    : `${(value / 1000).toFixed(2)} s`;

export function printHeader(command: string) {
  write(
    '',
    ` ${c.bgCyan(c.black(` ${command} `))} ${c.bold('Midscene Grounding Benchmark')} ${c.dim(`v${version}`)}`,
    ` ${c.dim(process.cwd())}`,
    '',
  );
}

export function printResult(
  status: 'PASS' | 'FAIL' | 'ERROR',
  message: string,
) {
  const color = status === 'PASS' ? c.green : c.red;
  write(` ${color(`${status === 'PASS' ? '✓' : '×'} ${status}`)} ${message}`);
}
