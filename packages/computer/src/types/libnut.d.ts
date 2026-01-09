declare module '@computer-use/libnut/dist/import_libnut' {
  interface ScreenSize {
    width: number;
    height: number;
  }

  interface Point {
    x: number;
    y: number;
  }

  type MouseButton = 'left' | 'right' | 'middle';
  type ToggleState = 'up' | 'down';

  interface LibNut {
    getScreenSize(): ScreenSize;
    getMousePos(): Point;
    moveMouse(x: number, y: number): void;
    mouseClick(button?: MouseButton, double?: boolean): void;
    mouseToggle(state: ToggleState, button?: MouseButton): void;
    scrollMouse(x: number, y: number): void;
    keyTap(key: string, modifiers?: string[]): void;
    typeString(text: string): void;
  }

  export const libnut: LibNut;
}

declare module '@computer-use/libnut' {
  interface ScreenSize {
    width: number;
    height: number;
  }

  export function getScreenSize(): ScreenSize;
}
