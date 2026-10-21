import assert from 'node:assert';
import type { InputTestServers } from './input-e2e-page';

export type InputMode = 'replace' | 'clear' | 'typeOnly';
export type FrameMode = 'same-origin' | 'cross-origin';

export type InputState = {
  events: Array<{ id: string; type: string; value: string }>;
  values: Record<string, string>;
};

export type ControlledInputState = {
  replacementCount: number;
  value: string;
};

export type InputTarget = {
  selector: string;
  frame?: FrameMode;
};

export type InputAction = {
  keyboardTypeDelay?: number;
  mode: InputMode;
  value: string;
};

export interface InputScenarioHarness {
  aiAssert(prompt: string): Promise<void>;
  blur(): Promise<void>;
  input(
    target: InputTarget,
    description: string,
    action: InputAction,
  ): Promise<void>;
  isFrameSameOrigin(mode: FrameMode): Promise<boolean>;
  publicInput(prompt: string, value: string): Promise<void>;
  readControlledState(): Promise<ControlledInputState>;
  readInputState(frame?: FrameMode): Promise<InputState>;
  readValue(target: InputTarget): Promise<string>;
  setCaret(target: InputTarget, offset: number): Promise<void>;
}

export type InputE2EScenario = {
  name: string;
  run(harness: InputScenarioHarness): Promise<void>;
  url(servers: InputTestServers): string;
};

type InputTestWindow = Window & {
  __midsceneControlledState?: () => ControlledInputState;
  __midsceneInputState?: () => InputState;
};

export function readEditableValue(element: Element): string {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    return element.value;
  }
  return element.textContent ?? '';
}

export function setEditableCaret(element: Element, offset: number): void {
  (element as HTMLElement).focus();
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    element.setSelectionRange(offset, offset);
    return;
  }

  const textNode = element.firstChild;
  if (!textNode) {
    throw new Error('Cannot set a caret on an element without text content');
  }
  const selection = window.getSelection();
  if (!selection) {
    throw new Error('Cannot set a caret because Selection is unavailable');
  }
  const range = document.createRange();
  range.setStart(textNode, offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function readInputStateFromWindow(): InputState {
  const readState = (window as InputTestWindow).__midsceneInputState;
  if (!readState) {
    throw new Error('Input test state is unavailable');
  }
  return readState();
}

export function readControlledStateFromWindow(): ControlledInputState {
  const readState = (window as InputTestWindow).__midsceneControlledState;
  if (!readState) {
    throw new Error('Controlled input test state is unavailable');
  }
  return readState();
}

const editableFields = [
  {
    description: 'Text input',
    eventTypes: ['beforeinput', 'input', 'change'],
    id: 'text-input',
    insertedValue: 'Alpha[inserted] value',
    replacementValue: 'Input replaced',
    selector: '#text-input',
  },
  {
    description: 'Notes textarea',
    eventTypes: ['beforeinput', 'input', 'change'],
    id: 'notes',
    insertedValue: 'Bravo[inserted] notes',
    replacementValue: 'Textarea replaced',
    selector: '#notes',
  },
  {
    description: 'Rich text editor',
    eventTypes: ['beforeinput', 'input'],
    id: 'rich-editor',
    insertedValue: 'Charl[inserted]ie rich text',
    replacementValue: 'Rich text replaced',
    selector: '#rich-editor',
  },
] as const;

function assertExpectedEvents(state: InputState): void {
  for (const field of editableFields) {
    const actualTypes = new Set(
      state.events.filter(({ id }) => id === field.id).map(({ type }) => type),
    );
    for (const expectedType of field.eventTypes) {
      assert(
        actualTypes.has(expectedType),
        `${field.id} should emit ${expectedType}; received: ${[
          ...actualTypes,
        ].join(', ')}`,
      );
    }
  }
}

const topLevelUrl = (servers: InputTestServers) => servers.topLevelUrl;

const replaceScenario: InputE2EScenario = {
  name: 'replaces input, textarea, and contenteditable values and emits browser events',
  url: topLevelUrl,
  run: async (harness) => {
    for (const field of editableFields) {
      await harness.input({ selector: field.selector }, field.description, {
        mode: 'replace',
        value: field.replacementValue,
      });
    }
    await harness.blur();

    const state = await harness.readInputState();
    assert.deepStrictEqual(
      state.values,
      Object.fromEntries(
        editableFields.map(({ id, replacementValue }) => [
          id,
          replacementValue,
        ]),
      ),
    );
    assertExpectedEvents(state);
    await harness.aiAssert(
      'The state summary shows Text input value: Input replaced, Textarea value: Textarea replaced, and Rich text value: Rich text replaced. It also shows non-zero beforeinput, input, and change event counts.',
    );
  },
};

const publicInputScenario: InputE2EScenario = {
  name: 'uses public aiInput to locate and replace a text input from its initial value',
  url: topLevelUrl,
  run: async (harness) => {
    const target = { selector: '#text-input' };
    assert.strictEqual(await harness.readValue(target), 'Alpha value');
    await harness.publicInput(
      'the text input labeled Text input',
      'Public replacement complete',
    );
    assert.strictEqual(
      await harness.readValue(target),
      'Public replacement complete',
    );
    await harness.aiAssert(
      'The state summary shows Text input value: Public replacement complete.',
    );
  },
};

const clearScenario: InputE2EScenario = {
  name: 'clears input, textarea, and contenteditable values and emits browser events',
  url: topLevelUrl,
  run: async (harness) => {
    for (const field of editableFields) {
      await harness.input({ selector: field.selector }, field.description, {
        mode: 'clear',
        value: '',
      });
    }
    await harness.blur();

    const state = await harness.readInputState();
    assert.deepStrictEqual(
      state.values,
      Object.fromEntries(editableFields.map(({ id }) => [id, ''])),
    );
    assertExpectedEvents(state);
    await harness.aiAssert(
      'The state summary shows [empty] for the text input, textarea, and rich text editor, with non-zero beforeinput, input, and change event counts.',
    );
  },
};

const typeOnlyScenario: InputE2EScenario = {
  name: 'inserts typeOnly text at the current caret in each editable field',
  url: topLevelUrl,
  run: async (harness) => {
    for (const field of editableFields) {
      const target = { selector: field.selector };
      await harness.setCaret(target, 5);
      await harness.input(target, field.description, {
        mode: 'typeOnly',
        value: '[inserted]',
      });
    }

    const state = await harness.readInputState();
    assert.deepStrictEqual(
      state.values,
      Object.fromEntries(
        editableFields.map(({ id, insertedValue }) => [id, insertedValue]),
      ),
    );
    await harness.aiAssert(
      'The state summary shows the inserted marker in the middle of all three values: Alpha[inserted] value, Bravo[inserted] notes, and Charl[inserted]ie rich text.',
    );
  },
};

function iframeScenario(mode: FrameMode): InputE2EScenario {
  return {
    name: `replaces and clears an input in a ${mode} iframe`,
    url: (servers) => servers.iframeUrl(mode),
    run: async (harness) => {
      assert.strictEqual(
        await harness.isFrameSameOrigin(mode),
        mode === 'same-origin',
      );
      const target = { frame: mode, selector: '#frame-input' };

      await harness.input(target, `${mode} iframe input`, {
        mode: 'replace',
        value: `${mode} replacement`,
      });
      assert.strictEqual(
        await harness.readValue(target),
        `${mode} replacement`,
      );
      await harness.aiAssert(
        `Inside the iframe, the state summary shows Iframe input value: ${mode} replacement.`,
      );

      await harness.input(target, `${mode} iframe input`, {
        mode: 'clear',
        value: '',
      });
      assert.strictEqual(await harness.readValue(target), '');
      await harness.aiAssert(
        'Inside the iframe, the state summary shows Iframe input value: [empty].',
      );
    },
  };
}

const controlledInputScenario: InputE2EScenario = {
  name: 'keeps every character when a controlled input is replaced after clearing',
  url: (servers) => servers.controlledUrl,
  run: async (harness) => {
    await harness.input(
      { selector: '#controlled-input' },
      'Controlled text input',
      {
        keyboardTypeDelay: 40,
        mode: 'replace',
        value: 'Stable controlled text',
      },
    );
    assert.deepStrictEqual(await harness.readControlledState(), {
      replacementCount: 1,
      value: 'Stable controlled text',
    });
    await harness.aiAssert(
      'The controlled input summary shows Controlled value: Stable controlled text and Replacement count: 1.',
    );
  },
};

export const inputE2EScenarios: readonly InputE2EScenario[] = [
  replaceScenario,
  publicInputScenario,
  clearScenario,
  typeOnlyScenario,
  iframeScenario('same-origin'),
  iframeScenario('cross-origin'),
  controlledInputScenario,
];
