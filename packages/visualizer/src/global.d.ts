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
