import { CLIError } from '@midscene/shared/cli';
import {
  type ViewportSize,
  defaultViewportSize,
  resolveViewportSize,
} from './common/viewport';

const viewportWidthFlags = ['--viewport-width', '--viewportWidth'];
const viewportHeightFlags = ['--viewport-height', '--viewportHeight'];

export interface ParsedWebCliOptions {
  argv: string[];
  mode: 'bridge' | 'cdp' | 'puppeteer';
  cdpEndpoint?: string;
  viewport: ViewportSize;
}

function isLikelyCdpEndpoint(value: string | undefined): boolean {
  return !!value && /^(wss?):\/\//.test(value);
}

function parsePositiveIntegerOption(flag: string, rawValue: string): number {
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value <= 0) {
    throw new CLIError(
      `Invalid value for "${flag}": expected a positive integer, got "${rawValue}".`,
    );
  }

  return value;
}

function readRequiredOptionValue(
  args: string[],
  index: number,
  flag: string,
): { value: string; nextIndex: number } {
  const currentArg = args[index];
  const inlinePrefix = `${flag}=`;
  if (currentArg.startsWith(inlinePrefix)) {
    return {
      value: currentArg.slice(inlinePrefix.length),
      nextIndex: index,
    };
  }

  const nextArg = args[index + 1];
  if (!nextArg || nextArg.startsWith('--')) {
    throw new CLIError(`Option "${flag}" requires a value.`);
  }

  return {
    value: nextArg,
    nextIndex: index + 1,
  };
}

function readOptionalCdpEndpoint(
  args: string[],
  index: number,
): { value?: string; nextIndex: number } {
  const currentArg = args[index];
  const inlinePrefix = '--cdp=';
  if (currentArg.startsWith(inlinePrefix)) {
    return {
      value: currentArg.slice(inlinePrefix.length),
      nextIndex: index,
    };
  }

  const nextArg = args[index + 1];
  if (!isLikelyCdpEndpoint(nextArg)) {
    return { nextIndex: index };
  }

  return {
    value: nextArg,
    nextIndex: index + 1,
  };
}

export function parseWebCliOptions(
  rawArgs: string[],
  env: NodeJS.ProcessEnv = process.env,
): ParsedWebCliOptions {
  const argv: string[] = [];
  let isBridge = false;
  let isCdp = false;
  let viewportWidth: number | undefined;
  let viewportHeight: number | undefined;
  let cdpEndpoint: string | undefined;

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (arg === '--bridge') {
      isBridge = true;
      continue;
    }

    if (arg === '--cdp' || arg.startsWith('--cdp=')) {
      isCdp = true;
      const parsed = readOptionalCdpEndpoint(rawArgs, index);
      cdpEndpoint = parsed.value ?? cdpEndpoint;
      index = parsed.nextIndex;
      continue;
    }

    const viewportWidthFlag = viewportWidthFlags.find(
      (flag) => arg === flag || arg.startsWith(`${flag}=`),
    );
    if (viewportWidthFlag) {
      const parsed = readRequiredOptionValue(rawArgs, index, viewportWidthFlag);
      viewportWidth = parsePositiveIntegerOption(
        viewportWidthFlag,
        parsed.value,
      );
      index = parsed.nextIndex;
      continue;
    }

    const viewportHeightFlag = viewportHeightFlags.find(
      (flag) => arg === flag || arg.startsWith(`${flag}=`),
    );
    if (viewportHeightFlag) {
      const parsed = readRequiredOptionValue(
        rawArgs,
        index,
        viewportHeightFlag,
      );
      viewportHeight = parsePositiveIntegerOption(
        viewportHeightFlag,
        parsed.value,
      );
      index = parsed.nextIndex;
      continue;
    }

    argv.push(arg);
  }

  if (isBridge && isCdp) {
    throw new CLIError(
      '--bridge and --cdp are mutually exclusive. Please specify only one.',
    );
  }

  const mode = isBridge ? 'bridge' : isCdp ? 'cdp' : 'puppeteer';

  if (mode !== 'puppeteer') {
    if (viewportWidth !== undefined || viewportHeight !== undefined) {
      throw new CLIError(
        'Viewport options are only supported in the default Puppeteer mode.',
      );
    }
  }

  if (mode === 'cdp') {
    cdpEndpoint = cdpEndpoint ?? env.MIDSCENE_CDP_ENDPOINT;
    if (!cdpEndpoint) {
      throw new CLIError(
        'CDP endpoint is required. Provide it as: --cdp <ws-endpoint> or set MIDSCENE_CDP_ENDPOINT environment variable.',
      );
    }
  }

  return {
    argv,
    mode,
    cdpEndpoint,
    viewport: resolveViewportSize(
      {
        width: viewportWidth,
        height: viewportHeight,
      },
      defaultViewportSize,
    ),
  };
}
