declare module 'react-dom/client' {
  import type { ReactNode } from 'react';

  export type Root = {
    render(children: ReactNode): void;
    unmount(): void;
  };

  export function createRoot(container: Element | DocumentFragment): Root;
}
