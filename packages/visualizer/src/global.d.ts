declare module '*.svg' {
  export const ReactComponent: React.FunctionComponent<
    React.SVGProps<SVGSVGElement> & {
      style?: React.CSSProperties; // 确保包含 style 属性
    }
  >;

  // const content: string;
  export default ReactComponent;
}

declare module '*.svg?react' {
  const ReactComponent: React.FunctionComponent<
    React.SVGProps<SVGSVGElement> & {
      style?: React.CSSProperties; // 确保包含 style 属性
    }
  >;
  export default ReactComponent;
}
