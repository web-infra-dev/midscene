import { stripVTControlCharacters } from 'node:util';
import stringWidth from 'string-width';
import { describe, expect, it, vi } from 'vitest';
import {
  TerminalProgress,
  truncateTerminalLine,
} from '../src/cli/terminal-progress';

const title = '[web] 搜索与加购👩‍💻e\u0301'.repeat(8);
const footer = [
  'Test Files 0 passed (3)',
  'Cases 0 passed (9)',
  'Start at 12:00:00',
  'Duration 1.0s',
];
const plain = (value: string) => stripVTControlCharacters(value);

describe('terminal progress block', () => {
  it.each([2, 20, 60, 100])(
    'keeps styled Unicode rows within a %i-column terminal',
    (columns) => {
      const io = { write: vi.fn(), columns, rows: 24 };
      new TerminalProgress(io).render([`\u001b[33m${title}\u001b[0m`], footer);
      const lines = plain(io.write.mock.calls.at(-1)![0])
        .split('\n')
        .filter(Boolean);
      expect(lines).toHaveLength(5);
      expect(lines.every((line) => stringWidth(line) < columns)).toBe(true);
      expect(lines[0]).not.toMatch(/\u200d…/);
    },
  );

  it('preserves styling when a row fits and never truncates inside a grapheme', () => {
    expect(truncateTerminalLine('\u001b[33mhello\u001b[0m', 10)).toBe(
      '\u001b[33mhello\u001b[0m',
    );
    expect(truncateTerminalLine('a👩‍💻e\u0301中文', 4)).toBe('a👩‍💻…');
    expect(truncateTerminalLine('ae\u0301xyz', 3)).toBe('ae\u0301…');
  });

  it('clears reflowed rows after narrowing, bounded by the viewport', () => {
    const io = { write: vi.fn(), columns: 100, rows: 24 };
    const progress = new TerminalProgress(io);
    progress.render([title], footer);
    const lines = plain(io.write.mock.calls.at(-1)![0])
      .split('\n')
      .filter(Boolean);
    io.columns = 40;
    progress.clear();
    const occupied = lines.reduce(
      (sum, line) => sum + Math.ceil(stringWidth(line) / 40),
      0,
    );
    expect(io.write.mock.calls.at(-1)![0]).toContain(
      `\r\u001b[${occupied}A\u001b[0J`,
    );
    const writes = io.write.mock.calls.length;
    progress.clear();
    expect(io.write).toHaveBeenCalledTimes(writes);
    progress.render([title], footer);
    io.rows = 3;
    progress.clear();
    expect(io.write.mock.calls.at(-1)![0]).toContain('\u001b[2A');
  });

  it('reserves footer space, shows overflow, and keeps the block height stable as tasks finish', () => {
    const io = { write: vi.fn(), columns: 100, rows: 12 };
    const progress = new TerminalProgress(io);
    progress.render(
      Array.from({ length: 20 }, () => title),
      footer,
    );
    const lines = plain(io.write.mock.calls.at(-1)![0]).split('\n');
    expect(lines).toHaveLength(11);
    expect(lines.join('\n')).toContain('more rows');
    expect(lines.join('\n')).toContain('Test Files');
    progress.render([], footer);
    expect(plain(io.write.mock.calls.at(-1)![0]).split('\n')).toHaveLength(11);
  });

  it('writes permanent output between erase and redraw with balanced synchronized-output markers', () => {
    const io = { write: vi.fn(), columns: 100, rows: 24 };
    const progress = new TerminalProgress(io);
    progress.render(['active task'], footer);
    io.write.mockClear();
    progress.output('a warning', io.write);
    const output = io.write.mock.calls.flat().join('');
    expect(output.startsWith('\u001b[?2026h')).toBe(true);
    expect(output.endsWith('\u001b[?2026l')).toBe(true);
    expect(output.indexOf('a warning\n')).toBeLessThan(
      output.indexOf('active task'),
    );
    const fail = () => {
      throw new Error('write failed');
    };
    expect(() => progress.output('failure', fail)).toThrow('write failed');
    expect(io.write.mock.calls.at(-1)![0]).toBe('\u001b[?2026l');
  });
});
