declare module '*.svg' {
  export const ReactComponent: React.FunctionComponent<
    React.SVGProps<SVGSVGElement> & {
      style?: React.CSSProperties;
    }
  >;

  export default ReactComponent;
}

declare module '*.png' {
  export default string;
}

declare module '*.svg?react' {
  const ReactComponent: React.FunctionComponent<
    React.SVGProps<SVGSVGElement> & {
      style?: React.CSSProperties;
    }
  >;
  export default ReactComponent;
}

// Extend the Window interface to include global and Buffer properties
interface Window {
  global: typeof globalThis;
  Buffer: any;
}

// version variable
declare const __VERSION__: string;
