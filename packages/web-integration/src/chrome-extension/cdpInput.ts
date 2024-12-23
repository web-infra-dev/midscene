// From https://github.com/puppeteer/puppeteer/blob/15abcc390862fd08cc3475532f2d9a11284aee6b/packages/puppeteer-core/src/cdp/Input.ts#L55
// with some modifications to fit the session type
/**
 * @license
 * Copyright 2017 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {
  type KeyDefinition,
  type KeyInput,
  _keyDefinitions,
} from './USKeyboardLayout';

type KeyDescription = Required<
  Pick<KeyDefinition, 'keyCode' | 'key' | 'text' | 'code' | 'location'>
>;

/**
 * @public
 */
export interface KeyDownOptions {
  /**
   * @deprecated Do not use. This is automatically handled.
   */
  text?: string;
  /**
   * @deprecated Do not use. This is automatically handled.
   */
  commands?: string[];
}

/**
 * @public
 */
export interface KeyboardTypeOptions {
  delay?: number;
}

/**
 * @public
 */
export type KeyPressOptions = KeyDownOptions & KeyboardTypeOptions;

type InternalCDPSession = {
  send: (command: string, params: any) => Promise<void>;
};

/**
 * @internal
 */
export class CdpKeyboard {
  #pressedKeys = new Set<string>();

  #client: InternalCDPSession;

  _modifiers = 0;

  constructor(client: InternalCDPSession) {
    this.#client = client;
  }

  updateClient(client: InternalCDPSession): void {
    this.#client = client;
  }

  async down(
    key: KeyInput,
    options: Readonly<KeyDownOptions> = {
      text: undefined,
      commands: [],
    },
  ): Promise<void> {
    const description = this.#keyDescriptionForString(key);

    const autoRepeat = this.#pressedKeys.has(description.code);
    this.#pressedKeys.add(description.code);
    this._modifiers |= this.#modifierBit(description.key);

    const text = options.text === undefined ? description.text : options.text;
    await this.#client.send('Input.dispatchKeyEvent', {
      type: text ? 'keyDown' : 'rawKeyDown',
      modifiers: this._modifiers,
      windowsVirtualKeyCode: description.keyCode,
      code: description.code,
      key: description.key,
      text: text,
      unmodifiedText: text,
      autoRepeat,
      location: description.location,
      isKeypad: description.location === 3,
      commands: options.commands,
    });
  }

  #modifierBit(key: string): number {
    if (key === 'Alt') {
      return 1;
    }
    if (key === 'Control') {
      return 2;
    }
    if (key === 'Meta') {
      return 4;
    }
    if (key === 'Shift') {
      return 8;
    }
    return 0;
  }

  #keyDescriptionForString(keyString: KeyInput): KeyDescription {
    const shift = this._modifiers & 8;
    const description = {
      key: '',
      keyCode: 0,
      code: '',
      text: '',
      location: 0,
    };

    const definition = _keyDefinitions[keyString];
    assert(definition, `Unknown key: "${keyString}"`);

    if (definition.key) {
      description.key = definition.key;
    }
    if (shift && definition.shiftKey) {
      description.key = definition.shiftKey;
    }

    if (definition.keyCode) {
      description.keyCode = definition.keyCode;
    }
    if (shift && definition.shiftKeyCode) {
      description.keyCode = definition.shiftKeyCode;
    }

    if (definition.code) {
      description.code = definition.code;
    }

    if (definition.location) {
      description.location = definition.location;
    }

    if (description.key.length === 1) {
      description.text = description.key;
    }

    if (definition.text) {
      description.text = definition.text;
    }
    if (shift && definition.shiftText) {
      description.text = definition.shiftText;
    }

    // if any modifiers besides shift are pressed, no text should be sent
    if (this._modifiers & ~8) {
      description.text = '';
    }

    return description;
  }

  async up(key: KeyInput): Promise<void> {
    const description = this.#keyDescriptionForString(key);

    this._modifiers &= ~this.#modifierBit(description.key);
    this.#pressedKeys.delete(description.code);
    await this.#client.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      modifiers: this._modifiers,
      key: description.key,
      windowsVirtualKeyCode: description.keyCode,
      code: description.code,
      location: description.location,
    });
  }

  async sendCharacter(char: string): Promise<void> {
    await this.#client.send('Input.insertText', { text: char });
  }

  private charIsKey(char: string): char is KeyInput {
    return !!_keyDefinitions[char as KeyInput];
  }

  async type(
    text: string,
    options: Readonly<KeyboardTypeOptions> = {},
  ): Promise<void> {
    const delay = options.delay || undefined;
    for (const char of text) {
      if (this.charIsKey(char)) {
        await this.press(char, { delay });
      } else {
        if (delay) {
          await new Promise((f) => {
            return setTimeout(f, delay);
          });
        }
        await this.sendCharacter(char);
      }
    }
  }

  async press(
    key: KeyInput,
    options: Readonly<KeyPressOptions> = {},
  ): Promise<void> {
    const { delay = null } = options;
    await this.down(key, options);
    if (delay) {
      await new Promise((f) => {
        return setTimeout(f, options.delay);
      });
    }
    await this.up(key);
  }
}
