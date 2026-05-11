export type DotPath<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : T[K] extends Record<string, unknown>
      ? DotPath<T[K], `${P}${K}.`>
      : never;
}[keyof T & string];

export interface LocaleContextValue {
  locale: string;
  setLocale: (locale: string) => void;
  cycleLocale: () => void;
  t: (key: string) => string;
  localeLabel: string;
}
