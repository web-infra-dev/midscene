import yargs from 'yargs/yargs';

export interface ReportVideoOptions {
  input: string;
  output?: string;
  name?: string;
  index?: number;
  autoZoom?: boolean;
  encoder?: 'ffmpeg' | 'media-recorder';
  format?: 'webm' | 'mp4';
  fps?: number;
  frameFormat?: 'jpeg' | 'png';
  concurrency?: number;
  scale?: number;
}

export type ReportVideoArgParseResult =
  | { type: 'ok'; options: ReportVideoOptions }
  | { type: 'help'; exitCode: 0 }
  | { type: 'error'; exitCode: 1 };

export const DEFAULT_FFMPEG_FPS = 15;
export const DEFAULT_FFMPEG_FRAME_FORMAT = 'jpeg';
export const DEFAULT_FFMPEG_CONCURRENCY = 4;
export const DEFAULT_FFMPEG_SCALE = 1;
const MAX_FFMPEG_FPS = 60;
const MAX_FFMPEG_CONCURRENCY = 8;
const MAX_FFMPEG_SCALE = 4;

type ParsedReportVideoArgs = {
  input?: string;
  output?: string;
  name?: string;
  index?: number;
  autoZoom?: boolean;
  encoder: 'ffmpeg' | 'media-recorder';
  format: 'webm' | 'mp4';
  fps?: number;
  frameFormat?: 'jpeg' | 'png';
  concurrency: number;
  scale: number;
  'auto-zoom': boolean;
  'frame-format': 'jpeg' | 'png';
};

export function printReportVideoHelp(): void {
  console.log(`
Usage: midscene report-video --input <report.html | dump.json> [options]

Generate the replay video of a Midscene report from the command line,
without opening the report in a browser.

Options:
  -i, --input <path>    Report HTML (file or directory) or a dump JSON file. (required)
  -o, --output <dir>    Output directory. Defaults to the Midscene report directory.
      --name <name>     Output file name without extension. Defaults to "midscene_replay".
      --index <n>       Which dump group to render for multi-group reports. Defaults to 0.
      --encoder <name>   Encoder to use: "ffmpeg" or "media-recorder". Defaults to "ffmpeg".
      --format <format>  Output format for ffmpeg: "webm" or "mp4". Defaults to "webm".
      --fps <n>          Output frame rate for ffmpeg. Defaults to ${DEFAULT_FFMPEG_FPS}; use 30 for full fidelity.
      --frame-format <format>  Intermediate frame format for ffmpeg: "jpeg" or "png". Defaults to "${DEFAULT_FFMPEG_FRAME_FORMAT}" for speed.
      --concurrency <n>  Parallel frame renderers for ffmpeg. Defaults to ${DEFAULT_FFMPEG_CONCURRENCY}.
      --scale <n>        Output resolution scale for ffmpeg. Defaults to ${DEFAULT_FFMPEG_SCALE}; use 2 for 1920×1080.
      --no-auto-zoom    Disable the auto-zoom camera animation.
  -h, --help            Show this help.
`);
}

// Returns null to signal "print help and stop" (missing input, --help, or a bad
// flag value). yargs handles -i/-o aliases, --key=value and --no-auto-zoom.
//
// Kept free of heavy imports (@midscene/core, puppeteer) so it stays cheap to
// unit-test in isolation.
export function parseReportVideoArgs(
  argv: string[],
): ReportVideoOptions | null {
  const result = parseReportVideoArgResult(argv);
  return result.type === 'ok' ? result.options : null;
}

export function parseReportVideoArgResult(
  argv: string[],
): ReportVideoArgParseResult {
  if (argv.includes('-h') || argv.includes('--help')) {
    return { type: 'help', exitCode: 0 };
  }

  let parsed: ParsedReportVideoArgs;
  try {
    parsed = yargs(argv)
      .exitProcess(false)
      .fail((message, error) => {
        throw error ?? new Error(message);
      })
      .help(false)
      .showHelpOnFail(false)
      .version(false)
      .options({
        input: {
          alias: 'i',
          type: 'string',
          description:
            'Report HTML (file or directory) or a dump JSON file. (required)',
        },
        output: {
          alias: 'o',
          type: 'string',
          description:
            'Output directory. Defaults to the Midscene report directory.',
        },
        name: {
          type: 'string',
          description:
            'Output file name without extension. Defaults to "midscene_replay".',
        },
        index: {
          type: 'number',
          description:
            'Which dump group to render for multi-group reports. Defaults to 0.',
        },
        encoder: {
          choices: ['ffmpeg', 'media-recorder'] as const,
          default: 'ffmpeg' as const,
          description:
            'Encoder to use. ffmpeg renders frames offline; media-recorder uses the browser recorder.',
        },
        format: {
          choices: ['webm', 'mp4'] as const,
          default: 'webm' as const,
          description:
            'Output format for the ffmpeg encoder. media-recorder only supports webm.',
        },
        fps: {
          type: 'number',
          description: `Output frame rate for the ffmpeg encoder. Defaults to ${DEFAULT_FFMPEG_FPS}.`,
        },
        'frame-format': {
          choices: ['jpeg', 'png'] as const,
          default: DEFAULT_FFMPEG_FRAME_FORMAT,
          description:
            'Intermediate frame format for the ffmpeg encoder. jpeg is faster; png is lossless.',
        },
        concurrency: {
          type: 'number',
          default: DEFAULT_FFMPEG_CONCURRENCY,
          description: `Parallel frame renderers for the ffmpeg encoder. Defaults to ${DEFAULT_FFMPEG_CONCURRENCY}.`,
        },
        scale: {
          type: 'number',
          default: DEFAULT_FFMPEG_SCALE,
          description: `Output resolution scale for the ffmpeg encoder. Defaults to ${DEFAULT_FFMPEG_SCALE}.`,
        },
        'auto-zoom': {
          type: 'boolean',
          default: true,
          description:
            'Auto-zoom camera animation. Use --no-auto-zoom to disable.',
        },
      })
      .parseSync() as ParsedReportVideoArgs;
  } catch (error) {
    console.error(
      `report-video: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { type: 'error', exitCode: 1 };
  }

  if (!parsed.input) {
    console.error('report-video: --input is required');
    return { type: 'error', exitCode: 1 };
  }

  if (
    parsed.index !== undefined &&
    (!Number.isInteger(parsed.index) || parsed.index < 0)
  ) {
    console.error('report-video: --index must be a non-negative integer');
    return { type: 'error', exitCode: 1 };
  }

  if (parsed.encoder === 'media-recorder' && parsed.format !== 'webm') {
    console.error('report-video: --encoder media-recorder only supports webm');
    return { type: 'error', exitCode: 1 };
  }

  if (
    parsed.fps !== undefined &&
    (!Number.isInteger(parsed.fps) ||
      parsed.fps <= 0 ||
      parsed.fps > MAX_FFMPEG_FPS)
  ) {
    console.error(
      `report-video: --fps must be a positive integer no greater than ${MAX_FFMPEG_FPS}`,
    );
    return { type: 'error', exitCode: 1 };
  }

  if (parsed.encoder === 'media-recorder' && parsed.fps !== undefined) {
    console.error('report-video: --fps is only supported by --encoder ffmpeg');
    return { type: 'error', exitCode: 1 };
  }

  if (
    parsed.encoder === 'media-recorder' &&
    parsed['frame-format'] !== DEFAULT_FFMPEG_FRAME_FORMAT
  ) {
    console.error(
      'report-video: --frame-format is only supported by --encoder ffmpeg',
    );
    return { type: 'error', exitCode: 1 };
  }

  if (
    !Number.isInteger(parsed.concurrency) ||
    parsed.concurrency <= 0 ||
    parsed.concurrency > MAX_FFMPEG_CONCURRENCY
  ) {
    console.error(
      `report-video: --concurrency must be a positive integer no greater than ${MAX_FFMPEG_CONCURRENCY}`,
    );
    return { type: 'error', exitCode: 1 };
  }

  if (
    !Number.isInteger(parsed.scale) ||
    parsed.scale <= 0 ||
    parsed.scale > MAX_FFMPEG_SCALE
  ) {
    console.error(
      `report-video: --scale must be a positive integer no greater than ${MAX_FFMPEG_SCALE}`,
    );
    return { type: 'error', exitCode: 1 };
  }

  if (
    parsed.encoder === 'media-recorder' &&
    parsed.scale !== DEFAULT_FFMPEG_SCALE
  ) {
    console.error(
      'report-video: --scale is only supported by --encoder ffmpeg',
    );
    return { type: 'error', exitCode: 1 };
  }

  const frameFormat = parsed['frame-format'] as 'jpeg' | 'png';

  return {
    type: 'ok',
    options: {
      input: parsed.input,
      output: parsed.output,
      name: parsed.name,
      index: parsed.index,
      autoZoom: parsed['auto-zoom'],
      encoder: parsed.encoder,
      format: parsed.format,
      fps: parsed.fps,
      frameFormat,
      concurrency: parsed.concurrency,
      scale: parsed.scale,
    },
  };
}
