import type { IOSDeviceOpt } from '@midscene/core/device';

export function assertWdaConnectionOptions(
  options?: Pick<
    IOSDeviceOpt,
    'wdaBaseUrl' | 'wdaHost' | 'wdaPort' | 'wdaMjpegUrl' | 'wdaMjpegPort'
  >,
): void {
  if (
    options?.wdaBaseUrl !== undefined &&
    (options.wdaHost !== undefined || options.wdaPort !== undefined)
  ) {
    throw new Error(
      'wdaBaseUrl cannot be used with wdaHost or wdaPort. Choose one WDA connection method.',
    );
  }
  if (
    options?.wdaMjpegUrl !== undefined &&
    options.wdaMjpegPort !== undefined
  ) {
    throw new Error(
      'wdaMjpegUrl cannot be used with wdaMjpegPort. Choose one MJPEG connection method.',
    );
  }
  if (options?.wdaMjpegUrl !== undefined) {
    normalizeMjpegStreamUrl(options.wdaMjpegUrl);
  }
}

export function normalizeMjpegStreamUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('wdaMjpegUrl must be an absolute HTTP(S) URL.');
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    value.includes('#')
  ) {
    throw new Error(
      'wdaMjpegUrl must use HTTP(S) without credentials or a fragment.',
    );
  }
  return url.toString();
}
