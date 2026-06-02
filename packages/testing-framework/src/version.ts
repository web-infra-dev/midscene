declare const __VERSION__: string | undefined;

export const DEFAULT_FRAMEWORK_VERSION =
  typeof __VERSION__ !== 'undefined' && __VERSION__ ? __VERSION__ : 'latest';
