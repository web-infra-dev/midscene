import { stripVTControlCharacters } from 'node:util';
import stringWidth from 'string-width';

interface ProgressIO {
  write?(message: string): void;
  columns?: number;
  rows?: number;
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const SYNC_START = '\u001b[?2026h';
const SYNC_END = '\u001b[?2026l';

export const truncateTerminalLine = (text: string, columns: number): string => {
  if (columns <= 0) return '';
  if (stringWidth(text) <= columns) return text;
  // Never split an ANSI sequence or grapheme when shortening a styled row.
  let output = '';
  let width = 0;
  for (const { segment } of graphemes.segment(stripVTControlCharacters(text))) {
    width += stringWidth(segment);
    if (width > columns - 1) break;
    output += segment;
  }
  return `${output}…`;
};

/** Owns only the transient block, with the cursor on a blank line below it. */
export class TerminalProgress {
  private lines: string[] = [];
  private content: string[] = [];
  private footer: string[] = [];

  constructor(private io: ProgressIO) {}

  private erase(): string {
    if (!this.lines.length) return '';
    const columns = Math.max(1, this.io.columns ?? 100);
    const occupiedRows = this.lines.reduce(
      (sum, line) => sum + Math.max(1, Math.ceil(stringWidth(line) / columns)),
      0,
    );
    const rows = Math.min(occupiedRows, Math.max(0, (this.io.rows ?? 24) - 1));
    this.lines = [];
    return `\r${rows ? `\u001b[${rows}A` : ''}\u001b[0J`;
  }

  private frame(previousHeight = 0): string {
    const availableRows = Math.max(0, (this.io.rows ?? 24) - 2);
    const columns = Math.max(0, (this.io.columns ?? 100) - 1);
    if (!availableRows || !columns) return '';
    const footer = this.footer.slice(0, availableRows);
    const budget = availableRows - footer.length;
    const overflow = this.content.length > budget;
    const visible = Math.max(0, budget - (overflow ? 1 : 0));
    const body = this.content.slice(0, visible);
    if (overflow && budget > 0)
      body.push(`  … ${this.content.length - visible} more rows`);
    const lines = [...body, ...footer].map((line) =>
      truncateTerminalLine(line, columns),
    );
    const blanks = Math.max(
      0,
      Math.min(previousHeight, availableRows) - lines.length,
    );
    this.lines = [...Array.from({ length: blanks }, () => ''), ...lines];
    return this.lines.length ? `${this.lines.join('\n')}\n` : '';
  }

  render(content: string[], footer: string[]): void {
    this.update(content, footer);
    const previousHeight = this.lines.length;
    const erase = this.erase();
    this.io.write?.(
      `${SYNC_START}${erase}${this.frame(previousHeight)}${SYNC_END}`,
    );
  }

  update(content: string[], footer: string[]): void {
    this.content = content;
    this.footer = footer;
  }

  /** Insert permanent output above the live block as one synchronized frame. */
  output(message: string, write: (message: string) => void): void {
    this.io.write?.(SYNC_START);
    try {
      const erase = this.erase();
      if (erase) this.io.write?.(erase);
      write(message.endsWith('\n') ? message : `${message}\n`);
      const frame = this.frame();
      if (frame) this.io.write?.(frame);
    } finally {
      this.io.write?.(SYNC_END);
    }
  }

  clear(): void {
    const erase = this.erase();
    this.content = [];
    this.footer = [];
    if (erase) this.io.write?.(`${SYNC_START}${erase}${SYNC_END}`);
  }
}
