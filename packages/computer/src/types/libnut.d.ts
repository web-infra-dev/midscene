declare module '@computer-use/libnut/dist/import_libnut' {
  interface ScreenSize {
    width: number;
    height: number;
  }

  interface LibNut {
    getScreenSize(): ScreenSize;
    moveMouse(x: number, y: number): void;
    mouseClick(button?: 'left' | 'right' | 'middle', double?: boolean): void;
    mouseToggle(
      state: 'up' | 'down',
      button?: 'left' | 'right' | 'middle',
    ): void;
    scrollMouse(x: number, y: number): void;
    keyTap(key: string, modifiers?: string[]): void;
    typeString(text: string): void;
  }

  export const libnut: LibNut;
}
