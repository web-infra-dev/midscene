/**
 * X11 Keysym mapping for VNC RFB protocol
 * Reference: https://www.x.org/releases/X11R7.7/doc/xproto/x11protocol.html#keysym_encoding
 */

// Standard ASCII characters map directly to their char code
// For special keys, use the X11 keysym values

export const X11_KEYSYM: Record<string, number> = {
  // Modifier keys
  shift: 0xffe1, // Shift_L
  shift_l: 0xffe1,
  shift_r: 0xffe2,
  control: 0xffe3, // Control_L
  ctrl: 0xffe3,
  control_l: 0xffe3,
  control_r: 0xffe4,
  alt: 0xffe9, // Alt_L
  alt_l: 0xffe9,
  alt_r: 0xffea,
  meta: 0xffe7, // Meta_L (Super/Windows key)
  meta_l: 0xffe7,
  meta_r: 0xffe8,
  super: 0xffeb, // Super_L
  super_l: 0xffeb,
  super_r: 0xffec,
  command: 0xffe7, // Map to Meta_L
  cmd: 0xffe7,
  option: 0xffe9, // Map to Alt_L (macOS option)
  win: 0xffeb, // Windows key -> Super_L
  windows: 0xffeb,
  capslock: 0xffe5,
  numlock: 0xff7f,

  // Navigation
  return: 0xff0d,
  enter: 0xff0d,
  tab: 0xff09,
  escape: 0xff1b,
  esc: 0xff1b,
  backspace: 0xff08,
  delete: 0xffff,
  del: 0xffff,
  insert: 0xff63,
  ins: 0xff63,
  home: 0xff50,
  end: 0xff57,
  pageup: 0xff55,
  pgup: 0xff55,
  pagedown: 0xff56,
  pgdn: 0xff56,
  space: 0x0020,

  // Arrow keys
  left: 0xff51,
  up: 0xff52,
  right: 0xff53,
  down: 0xff54,
  arrowleft: 0xff51,
  arrowup: 0xff52,
  arrowright: 0xff53,
  arrowdown: 0xff54,

  // Function keys
  f1: 0xffbe,
  f2: 0xffbf,
  f3: 0xffc0,
  f4: 0xffc1,
  f5: 0xffc2,
  f6: 0xffc3,
  f7: 0xffc4,
  f8: 0xffc5,
  f9: 0xffc6,
  f10: 0xffc7,
  f11: 0xffc8,
  f12: 0xffc9,

  // Keypad
  kp_0: 0xffb0,
  kp_1: 0xffb1,
  kp_2: 0xffb2,
  kp_3: 0xffb3,
  kp_4: 0xffb4,
  kp_5: 0xffb5,
  kp_6: 0xffb6,
  kp_7: 0xffb7,
  kp_8: 0xffb8,
  kp_9: 0xffb9,
  kp_enter: 0xff8d,
  kp_add: 0xffab,
  kp_subtract: 0xffad,
  kp_multiply: 0xffaa,
  kp_divide: 0xffaf,
  kp_decimal: 0xffae,

  // Media keys (XF86 keysyms)
  audio_vol_up: 0x1008ff13,
  audio_vol_down: 0x1008ff11,
  audio_mute: 0x1008ff12,
  audio_play: 0x1008ff14,
  audio_pause: 0x1008ff31,
  audio_stop: 0x1008ff15,
  audio_next: 0x1008ff17,
  audio_prev: 0x1008ff16,

  // Print/Scroll/Pause
  print: 0xff61,
  printscreen: 0xff61,
  scrolllock: 0xff14,
  pause: 0xff13,
  break: 0xff6b,

  // Misc
  menu: 0xff67,
  contextmenu: 0xff67,
};

/**
 * Modifier key names for use in key combinations
 */
export const MODIFIER_KEYSYMS: Record<string, number> = {
  shift: 0xffe1,
  control: 0xffe3,
  ctrl: 0xffe3,
  alt: 0xffe9,
  meta: 0xffe7,
  command: 0xffe7,
  cmd: 0xffe7,
  super: 0xffeb,
  win: 0xffeb,
  option: 0xffe9,
};

/**
 * Convert a key name to X11 keysym value
 * For single printable characters, returns the Unicode code point
 */
export function keyToKeysym(key: string): number {
  const lowerKey = key.toLowerCase();

  // Check special keys first
  const keysym = X11_KEYSYM[lowerKey];
  if (keysym !== undefined) {
    return keysym;
  }

  // For single characters, use the char code
  if (key.length === 1) {
    const charCode = key.charCodeAt(0);
    // ASCII printable characters map directly
    if (charCode >= 0x20 && charCode <= 0x7e) {
      return charCode;
    }
    // For non-ASCII Unicode, use the Unicode keysym range (0x01000000 + codepoint)
    if (charCode > 0x7e) {
      return 0x01000000 + charCode;
    }
  }

  // Unknown key - try as a char code
  throw new Error(`Unknown key: "${key}". Cannot map to X11 keysym.`);
}

/**
 * Convert a modifier name to X11 keysym
 */
export function modifierToKeysym(modifier: string): number {
  const lowerMod = modifier.toLowerCase();
  const keysym = MODIFIER_KEYSYMS[lowerMod];
  if (keysym !== undefined) {
    return keysym;
  }
  throw new Error(`Unknown modifier: "${modifier}"`);
}
