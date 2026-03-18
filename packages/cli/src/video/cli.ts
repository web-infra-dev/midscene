import type { VideoScriptFormat } from '@midscene/core/ai-model';
import type { Video2YamlOptions } from './index';

/**
 * Consume the next argument value for a given flag, or exit with error.
 */
function consumeArg(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith('-')) {
    console.error(`Error: ${flag} requires a value`);
    process.exit(1);
  }
  return value;
}

/**
 * Parse arguments for the video2yaml subcommand.
 *
 * Usage: midscene video2yaml <video-file> [options]
 *   --output, -o      Output file path
 *   --format, -f      Output format: yaml (default) or playwright
 *   --url             Starting URL of the page in the video
 *   --description     Description of what the video demonstrates
 *   --fps             Frames per second to extract (default: 1)
 *   --max-frames      Maximum number of frames (default: 20)
 *   --viewport-width  Viewport width
 *   --viewport-height Viewport height
 */
export function parseVideo2YamlArgs(args: string[]): Video2YamlOptions {
  const options: Video2YamlOptions = { input: '' };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--output' || arg === '-o') {
      options.output = consumeArg(args, i, arg);
      i++;
    } else if (arg === '--format' || arg === '-f') {
      const fmt = consumeArg(args, i, arg);
      if (fmt !== 'yaml' && fmt !== 'playwright') {
        console.error(`Invalid format: ${fmt}. Must be "yaml" or "playwright"`);
        process.exit(1);
      }
      options.format = fmt as VideoScriptFormat;
      i++;
    } else if (arg === '--url') {
      options.url = consumeArg(args, i, arg);
      i++;
    } else if (arg === '--description') {
      options.description = consumeArg(args, i, arg);
      i++;
    } else if (arg === '--fps') {
      options.fps = Number(consumeArg(args, i, arg));
      i++;
    } else if (arg === '--max-frames') {
      options.maxFrames = Number(consumeArg(args, i, arg));
      i++;
    } else if (arg === '--viewport-width') {
      options.viewportWidth = Number(consumeArg(args, i, arg));
      i++;
    } else if (arg === '--viewport-height') {
      options.viewportHeight = Number(consumeArg(args, i, arg));
      i++;
    } else if (arg === '--max-frames-per-segment') {
      options.maxFramesPerSegment = Number(consumeArg(args, i, arg));
      i++;
    } else if (arg === '--scene-threshold') {
      options.sceneThreshold = Number(consumeArg(args, i, arg));
      i++;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith('-') && !options.input) {
      options.input = arg;
    } else {
      console.error(`Unknown option: ${arg}`);
      printHelp();
      process.exit(1);
    }
    i++;
  }

  if (!options.input) {
    console.error('Error: video file path is required');
    printHelp();
    process.exit(1);
  }

  return options;
}

function printHelp(): void {
  console.log(`
Usage: midscene video2yaml <video-file> [options]

Generate a runnable Midscene test script from a screen recording video.

Arguments:
  video-file              Path to the video file (mp4, webm, etc.)

Options:
  -o, --output <path>     Output file path (default: <video-file>.yaml or .test.ts)
  -f, --format <format>   Output format: "yaml" (default) or "playwright"
  --url <url>             Starting URL of the web page in the video
  --description <text>    Description of what the video demonstrates
  --fps <number>          Frames per second to extract (default: 1)
  --max-frames <number>   Maximum number of frames to analyze (default: 20)
  --viewport-width <px>   Viewport width of the recorded page
  --viewport-height <px>  Viewport height of the recorded page
  --max-frames-per-segment <n>  Max frames per segment for long videos (default: 15)
  --scene-threshold <0-1> Scene change sensitivity, lower=more splits (default: 0.3)
  -h, --help              Show this help message

Note: Short videos (≤20 frames) are processed in a single VLM call.
      Long videos are automatically split into segments and merged.

Examples:
  # Generate YAML script (default)
  midscene video2yaml recording.mp4
  midscene video2yaml recording.mp4 -o test.yaml --url https://example.com

  # Generate Playwright test
  midscene video2yaml recording.mp4 --format playwright
  midscene video2yaml recording.mp4 -f playwright -o login.test.ts

  # Custom frame extraction
  midscene video2yaml demo.webm --fps 2 --max-frames 30 --description "Login flow test"

  # Long video with custom segmentation
  midscene video2yaml long-demo.mp4 --scene-threshold 0.2 --max-frames-per-segment 20
`);
}
