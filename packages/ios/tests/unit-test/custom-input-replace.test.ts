import { afterEach, beforeEach, describe, expect, it, rs } from '@rstest/core';
import { IOSDevice } from '../../src/device';

describe('located iOS replacement on custom inputs', () => {
  const original = 'first line\nsecond line';
  const target = { center: [40, 80] };
  let value: string;
  let menuOpen: boolean;
  let selected: boolean;
  let itemCount: number;
  let keyboardTop: number;
  let rejectClick: boolean;
  let keyRequests: string[];
  let holds: number;
  let active: { accessible: boolean; value: string | null } | undefined;

  function replace(text: string, inputStrategy?: 'sequential') {
    const device = new IOSDevice({
      sessionId: 'fixture',
      autoDismissKeyboard: false,
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

  beforeEach(() => {
    value = original;
    menuOpen = false;
    selected = false;
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
          return ok(active!.value);
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
          expect(body.using).toBe('class chain');
          expect(body.value).toContain('XCUIElementTypeMenuItem');
          expect(body.value).toContain('XCUIElementTypeButton');
          expect(body.value).toContain('"Copy"');
          expect(body.value).toContain('全选');
          if (!menuOpen) return ok([]);
          return ok(
            Array.from({ length: itemCount }, (_, i) => ({
              ELEMENT: `all-${i}`,
            })),
          );
        }
        case '/element/keyboard/rect':
          return ok({ x: 0, y: keyboardTop, width: 375, height: 220 });
        case '/element/field/rect':
          return ok({ x: 10, y: 30, width: 100, height: 70 });
        case '/wda/touchAndHold':
          expect(body).toMatchObject({ x: 40, y: 80 });
          holds++;
          menuOpen = true;
          return ok(null);
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
          value = (selected ? '' : value) + keys;
          selected = false;
          return ok(null);
        }
        default:
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

  it('uses an already open edit menu for sequential replacement', async () => {
    menuOpen = true;
    await replace('A😀', 'sequential');
    expect(holds).toBe(0);
    expect(value).toBe('A😀');
    expect(keyRequests).toEqual(['A', '😀']);
  });

  it('selects the contents of an inaccessible UIKeyInput whose WDA value is null', async () => {
    active = { accessible: false, value: null };
    await replace('昵称42');
    expect(holds).toBe(1);
    expect(value).toBe('昵称42');
  });

  it('can open the active editor’s edit menu when the software keyboard is hidden', async () => {
    active = { accessible: false, value: null };
    keyboardTop = -1;
    await replace('new');
    expect(holds).toBe(1);
    expect(value).toBe('new');
  });

  it.each([
    { accessible: true, value: null },
    { accessible: true, value: 'old' },
    { accessible: false, value: 'old' },
  ])(
    'uses native clear for a readable or accessible input (%j)',
    async (field) => {
      active = field;
      value = field.value ?? '';
      await replace('new');
      expect(holds).toBe(0);
      expect(value).toBe('new');
    },
  );

  it('avoids pressing the keyboard if it now covers the input location', async () => {
    keyboardTop = 60;
    await expect(replace('new')).rejects.toThrow('edit menu');
    expect(holds).toBe(0);
    expect(keyRequests).toEqual([]);
    expect(value).toBe(original);
  });

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
  );

  it('propagates a failed selection without typing or retrying', async () => {
    rejectClick = true;
    await expect(replace('new')).rejects.toThrow('404');
    expect(holds).toBe(1);
    expect(keyRequests).toEqual([]);
    expect(value).toBe(original);
  });
});
