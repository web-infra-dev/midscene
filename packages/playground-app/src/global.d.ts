declare module '*.svg' {
  export const ReactComponent: React.FunctionComponent<
    React.SVGProps<SVGSVGElement> & {
      style?: React.CSSProperties;
    }
  >;

  export default ReactComponent;
}

declare module '*.svg?react' {
  const ReactComponent: React.FunctionComponent<
    React.SVGProps<SVGSVGElement> & {
      style?: React.CSSProperties;
    }
  >;
  export default ReactComponent;
}

declare const __VERSION__: string;
