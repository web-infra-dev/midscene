import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { androidAuditMarkerLabelPlacement } from '../../src/android-audit-marker-presentation';

describe('Android audit marker presentation', () => {
  it('keeps a top-edge marker label inside the frame so its status color stays visible', () => {
    expect(androidAuditMarkerLabelPlacement(0)).toBe('inside');
  });

  it('keeps an ordinary marker label outside the frame', () => {
    expect(androidAuditMarkerLabelPlacement(1)).toBe('outside');
  });

  it('does not tint overlapping nodes until a marker is selected', async () => {
    const source = await readFile(
      new URL(
        '../../../../apps/android-playground/src/android-audit/android-audit.less',
        import.meta.url,
      ),
      'utf8',
    );
    expect(source).toMatch(
      /\.android-audit-marker\s*\{[^}]*background:\s*transparent;/s,
    );
    expect(source).toMatch(/&\.selected\s*\{[^}]*background:\s*color-mix\(/s);
    expect(source).toMatch(
      /\.status-point-selected-other\s*>\s*span\s*\{[^}]*z-index:\s*30;/s,
    );
  });
});
