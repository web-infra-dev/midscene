type LogoContext = {
  keys: () => string[];
  (key: string): string;
};

declare const require: {
  context: (
    directory: string,
    useSubdirectories: boolean,
    regExp: RegExp,
  ) => LogoContext;
};

const logoContext = require.context(
  './assets/model-logos',
  false,
  /\.(ico|jpe?g|png|svg|webp)$/i,
);

export const MODEL_LOGO_URLS: Record<string, string> = Object.fromEntries(
  logoContext.keys().map((key) => {
    const fileName = key.replace(/^\.\//, '');
    return [
      `benchmark/grounding/dashboard/src/report-template/assets/model-logos/${fileName}`,
      logoContext(key),
    ];
  }),
);

export function normalizeModelLogoPath(
  value: string | null | undefined,
): string {
  return value?.trim().replace(/^\.\//, '') ?? '';
}
