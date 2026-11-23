import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
import { IOSDevice } from '../../src/device';

describe('located iOS replacement on custom inputs', () => {
  const original = 'first line\nsecond line';
  const target = { center: [40, 80] };
  let value: string;
  let menuOpen: boolean;
  let opensOnTap: boolean;
  let decoy: boolean;
  let decoyOnFocus: boolean;
  let outsideClicks: number;
  let snapshot: number;
  let menuY: number;
  let placeholder: string | null;
  let emptyNativeMenu: boolean;
  let reportsInputValue: boolean;
  let readbacks: number;
  let selected: boolean;
  let itemCount: number;
  let keyboardTop: number;
  let rejectClick: boolean;
  let keyRequests: string[];
  let holds: number;
  let active: { accessible: boolean; value: string | null } | undefined;

  function replace(
    text: string,
    inputStrategy?: 'sequential',
    customInputClearFallbackMaxDeleteCount?: number,
  ) {
    const device = new IOSDevice({
      sessionId: 'fixture',
      autoDismissKeyboard: false,
      customInputClearFallbackMaxDeleteCount,
    });
    const input = device
      .actionSpace()
      .find((action) => action.name === 'Input')!;
    return input.call({
      locate: target,
      mode: 'replace',
      value: text,
      inputStrategy,
    });
  }

  function clear(customInputClearFallbackMaxDeleteCount?: number) {
    const device = new IOSDevice({
      sessionId: 'fixture',
      autoDismissKeyboard: false,
      customInputClearFallbackMaxDeleteCount,
    });
    const input = device
      .actionSpace()
      .find((action) => action.name === 'Input')!;
    return input.call({
      locate: target,
      mode: 'clear',
      value: '',
    });
  }

  beforeEach(() => {
    value = original;
    menuOpen = false;
    selected = false;
    opensOnTap = false;
    decoy = false;
    decoyOnFocus = false;
    outsideClicks = 0;
    snapshot = 0;
    menuY = 10;
    placeholder = null;
    emptyNativeMenu = false;
    reportsInputValue = false;
    readbacks = 0;
    itemCount = 1;
    keyboardTop = 400;
    rejectClick = false;
    keyRequests = [];
    holds = 0;
    active = undefined;
    rs.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname.replace(
        '/session/fixture',
        '',
      );
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const ok = (value: unknown) => Response.json({ value });
      switch (path) {
        case '/wda/tap':
          menuOpen = opensOnTap;
          if (decoyOnFocus) decoy = true;
          return ok(null);
        case '/element/active':
          if (active) return ok({ ELEMENT: 'field' });
          return Response.json(
            { value: { error: 'no such element' } },
            { status: 404 },
          );
        case '/element/field/attribute/accessible':
          return ok(active!.accessible);
        case '/element/field/attribute/value':
          if (keyRequests.length) readbacks++;
          return ok(
            reportsInputValue && keyRequests.length ? value : active!.value,
          );
        case '/element/field/attribute/placeholderValue':
          return ok(placeholder);
        case '/element/field/attribute/name':
          return ok(null);
        case '/element/field/attribute/type':
          return ok('XCUIElementTypeTextView');
        case '/element/field/clear':
          // WDA reports success for an absent value without deleting anything.
          if (active!.value) value = '';
          return ok(null);
        case '/elements': {
          if (body.value.includes('XCUIElementTypeKeyboard'))
            return ok(keyboardTop < 0 ? [] : [{ ELEMENT: 'keyboard' }]);
          if (body.value.startsWith('**/XCUIElementTypeCollectionView')) {
            return ok(
              menuOpen && emptyNativeMenu ? [{ ELEMENT: 'empty-menu' }] : [],
            );
          }
          expect(body.using).toBe('class chain');
          expect(body.value).toContain('XCUIElementTypeMenuItem');
          expect(body.value).toContain('XCUIElementTypeButton');
          expect(body.value).toContain('"Copy"');
          expect(body.value).toContain('全选');
          snapshot++;
          return ok([
            ...(decoy ? [{ ELEMENT: 'page' }] : []),
            ...(menuOpen ? [{ ELEMENT: 'editor-menu' }] : []),
          ]);
        }
        case '/element/empty-menu/rect':
          return ok({ x: 12, y: 10, width: 70, height: 42 });
        case '/element/empty-menu/elements':
          return ok([]);
        case '/element/page/rect':
          return ok({ x: 8, y: 61, width: 80, height: 30 });
        case '/element/page/elements':
          return ok([{ ELEMENT: `outside-${snapshot}` }]);
        case '/element/editor-menu/rect':
          return ok({ x: 15, y: menuY, width: 180, height: 40 });
        case '/element/editor-menu/elements':
          expect(body.using).toBe('predicate string');
          return ok(
            Array.from({ length: itemCount }, (_, i) => ({
              ELEMENT: `all-${i}`,
            })),
          );
        case '/element/keyboard/rect':
          return ok({ x: 0, y: keyboardTop, width: 375, height: 220 });
        case '/element/field/rect':
          return ok({ x: 10, y: 30, width: 100, height: 70 });
        case '/wda/touchAndHold':
          expect(body).toMatchObject({ x: 40, y: 80 });
          holds++;
          menuOpen = true;
          return ok(null);
        case '/element/all-0/attribute/type':
          return ok('XCUIElementTypeMenuItem');
        case '/element/all-0/click':
          if (rejectClick)
            return Response.json(
              { value: { error: 'stale element reference' } },
              { status: 404 },
            );
          selected = true;
          return ok(null);
        case '/wda/keys': {
          const keys = body.value.join('');
          keyRequests.push(keys);
          if (selected) value = '';
          for (const key of keys) {
            if (key === '\b') value = Array.from(value).slice(0, -1).join('');
            else value += key;
          }
          selected = false;
          return ok(null);
        }
        default:
          if (path.match(/^\/element\/outside-\d+\/attribute\/type$/))
            return ok('XCUIElementTypeButton');
          if (path.match(/^\/element\/outside-\d+\/click$/)) {
            outsideClicks++;
            return ok(null);
          }
          throw new Error(`Unexpected WDA request ${path}`);
      }
    });
  });
  afterEach(() => {
    rs.restoreAllMocks();
  });

  it('opens the edit menu once and replaces all lines, preserving whitespace', async () => {
    await replace(' 新名字 ');
    expect(holds).toBe(1);
    expect(value).toBe(' 新名字 ');
    expect(keyRequests).toEqual([' 新名字 ']);
  });

  it('uses the edit menu opened by the tap for sequential replacement', async () => {
    opensOnTap = true;
    await replace('A😀', 'sequential');
    expect(holds).toBe(0);
    expect(value).toBe('A😀');
    expect(keyRequests).toEqual(['A', '😀']);
  });

  it.each([true, false])(
    'replaces hidden old text even when accessible=%s',
    async (accessible) => {
      active = { accessible, value: null };
      await replace('昵称42');
      expect(holds).toBe(1);
      expect(value).toBe('昵称42');
    },
  );

  it('can open the active editor’s edit menu when the software keyboard is hidden', async () => {
    active = { accessible: false, value: null };
    keyboardTop = -1;
    await replace('new');
    expect(holds).toBe(1);
    expect(value).toBe('new');
  });

  it.each([
    { accessible: true, value: 'old' },
    { accessible: false, value: 'old' },
  ])('uses native clear for a readable input (%j)', async (field) => {
    active = field;
    value = field.value ?? '';
    await replace('new');
    expect(holds).toBe(0);
    expect(value).toBe('new');
  });

  it('ignores an existing Select All toolbar even when WDA reassigns its button ID', async () => {
    decoy = true;
    await replace('new');
    expect(value).toBe('new');
    expect(outsideClicks).toBe(0);
    expect(holds).toBe(1);
  });

  it('ignores a separate toolbar that appears when tapping opens the keyboard', async () => {
    decoyOnFocus = true;
    await replace('new');
    expect(value).toBe('new');
    expect(outsideClicks).toBe(0);
    expect(holds).toBe(1);
  });

  it.each(['existing', 'distant'])(
    'stops before typing when only a %s toolbar is available',
    async (kind) => {
      decoy = kind === 'existing';
      if (decoy) itemCount = 0;
      else menuY = 540;
      await expect(replace('new')).rejects.toThrow(
        /Select All|deadline|timeout/i,
      );
      expect(value).toBe(original);
      expect(outsideClicks).toBe(0);
      expect(keyRequests).toEqual([]);
    },
    10_000,
  );

  it.each([null, 'Nickname'])(
    'replaces an empty UIKit field showing its empty caret menu (%s)',
    async (reportedValue) => {
      placeholder = reportedValue ?? '';
      active = { accessible: true, value: reportedValue };
      itemCount = 0;
      emptyNativeMenu = true;
      reportsInputValue = true;
      value = '';
      await replace(' new ');
      expect(value).toBe(' new ');
      expect(readbacks).toBe(1);
    },
  );

  it('requires readback when the native empty-field path is used', async () => {
    placeholder = '';
    active = { accessible: true, value: null };
    itemCount = 0;
    value = '';
    emptyNativeMenu = true;
    await expect(replace('new')).rejects.toThrow('verify the replacement');
    expect(keyRequests).toEqual(['new']);
  });

  it('selects hidden old text when WDA reports only a placeholder', async () => {
    placeholder = 'Nickname';
    active = { accessible: true, value: placeholder };
    await replace('new');
    expect(holds).toBe(1);
    expect(value).toBe('new');
  });

  it('avoids pressing the keyboard if it now covers the input location', async () => {
    keyboardTop = 60;
    await expect(replace('new')).rejects.toThrow('edit menu');
    expect(holds).toBe(0);
    expect(keyRequests).toEqual([]);
    expect(value).toBe(original);
  });

  it('clears with bounded backspaces when the edit menu is inaccessible and fallback is enabled', async () => {
    itemCount = 0;
    await clear(40);
    expect(value).toBe('');
    expect(keyRequests).toEqual(['\b'.repeat(40)]);
  }, 10_000);

  it('falls back to bounded backspaces when the edit menu is inaccessible and fallback is enabled', async () => {
    itemCount = 0;
    await replace('new', undefined, 40);
    expect(value).toBe('new');
    expect(keyRequests).toEqual(['\b'.repeat(40), 'new']);
  }, 10_000);

  it.each([0, 2])(
    'preserves the old value with %i matching menu actions',
    async (count) => {
      itemCount = count;
      await expect(replace('new')).rejects.toThrow(
        /Select All|deadline|timeout/i,
      );
      expect(keyRequests).toEqual([]);
      expect(value).toBe(original);
    },
    10_000,
  );

  it('propagates a failed selection without typing or retrying', async () => {
    rejectClick = true;
    await expect(replace('new')).rejects.toThrow('404');
    expect(holds).toBe(1);
    expect(keyRequests).toEqual([]);
    expect(value).toBe(original);
  });
});
