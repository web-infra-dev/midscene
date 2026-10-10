import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import chalk from 'chalk';
import {
  defaultCredentialsPath,
  lockCredentials,
  readRegistration,
  requireCredentials,
  saveRegistration,
} from './openai/credentials';
import { SiwcError, describeSiwcError, withSiwcStage } from './openai/errors';
import { loginWithOpenAI } from './openai/login';
import { refreshOpenAICredentials } from './openai/refresh';

const USAGE = `Usage:
  midscene model siwc login [--no-open] [--port <port>]
  midscene model siwc refresh

Sign in with ChatGPT or refresh the saved credentials.
Full credentials are saved to ~/.midscene/siwc.json. Only the access token is printed to stdout.
Midscene does not collect your credentials.

Options (login):
  --no-open           Print the authorization URL without opening a browser
  --port <port>       Loopback callback port (default: an available port)
  --help, -h          Show this help
`;

async function openBrowser(url: string) {
  const command =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'rundll32'
        : 'xdg-open';
  const args =
    process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore', shell: false });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

export async function runSiwcCommand(
  args: string[],
  io = { stdout: console.log, stderr: console.error },
  credentialsPath = defaultCredentialsPath(),
): Promise<number> {
  if (!args.length || args.includes('--help') || args.includes('-h')) {
    io.stdout(USAGE);
    return 0;
  }
  const [action, ...options] = args;
  if (action !== 'login' && action !== 'refresh') {
    io.stderr(`Unknown SIWC command: ${action}\n${USAGE}`);
    return 1;
  }
  const portOptions: { port: number; noOpen: boolean } = {
    port: 0,
    noOpen: false,
  };
  const seen = new Set<string>();
  for (let index = 0; index < options.length; index++) {
    const option = options[index];
    if (
      action !== 'login' ||
      seen.has(option) ||
      !['--port', '--no-open'].includes(option)
    ) {
      io.stderr(`Invalid midscene model siwc arguments.\n${USAGE}`);
      return 1;
    }
    seen.add(option);
    if (option === '--no-open') {
      portOptions.noOpen = true;
    } else {
      const value = options[++index];
      if (!value || !/^\d+$/.test(value) || Number(value) > 65535) {
        io.stderr('--port must be an integer between 0 and 65535.');
        return 1;
      }
      portOptions.port = Number(value);
    }
  }
  const unlock = await lockCredentials(credentialsPath).catch(
    (error: Error) => {
      io.stderr(describeSiwcError(error));
      return undefined;
    },
  );
  if (!unlock) {
    return 1;
  }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timer = setTimeout(cancel, 5 * 60 * 1000);
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  try {
    io.stderr(chalk.cyan.bold(`🔄 Starting OpenAI SIWC ${action}...`));
    const saved = await withSiwcStage('Read credentials', () =>
      readRegistration(credentialsPath),
    );
    const credentials = await (async () => {
      if (action === 'refresh') {
        return withSiwcStage('Refresh', () =>
          refreshOpenAICredentials(
            requireCredentials(saved),
            controller.signal,
          ),
        );
      }
      const registration = saved ?? {
        ext_agent_host_id: `urn:uuid:${randomUUID()}`,
      };
      // Persist the host ID before authorization, including unsuccessful attempts.
      if (!saved) {
        await withSiwcStage('Save registration', () =>
          saveRegistration(credentialsPath, registration),
        );
      }
      const result = await withSiwcStage('Login', () =>
        loginWithOpenAI({
          port: portOptions.port,
          hostId: registration.ext_agent_host_id,
          clientId: registration.client_id,
          signal: controller.signal,
          onAuthorization: async (url) => {
            io.stderr(
              `\n${chalk.bold('Continue with ChatGPT:')}\n${url}\n\n${chalk.gray('Waiting for authorization...')}`,
            );
            if (!portOptions.noOpen) {
              try {
                await openBrowser(url);
              } catch {
                io.stderr('Open the URL above in your browser to continue.');
              }
            }
          },
        }),
      );
      if (registration.subject && result.subject !== registration.subject) {
        throw new SiwcError('Login identity does not match the saved account.');
      }
      return result;
    })();
    await withSiwcStage('Save credentials', () =>
      saveRegistration(credentialsPath, credentials),
    );
    io.stderr('\n🔑 your Access token:');
    io.stdout(credentials.access_token);
    const expiresAt = new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'long',
    }).format(credentials.expires_at);
    const remainingMinutes = Math.ceil(
      (credentials.expires_at - Date.now()) / 60_000,
    );
    const expiresIn = new Intl.RelativeTimeFormat('en', {
      numeric: 'always',
    }).format(
      remainingMinutes === 60 ? 1 : remainingMinutes,
      remainingMinutes === 60 ? 'hour' : 'minute',
    );
    io.stderr(`\nExpires at: ${expiresAt} (${expiresIn})`);
    io.stderr(
      `\n${chalk.green(`✅ SIWC ${action} succeeded.`)}\n\nYou can use this access token as your model API Key in Midscene by setting MIDSCENE_MODEL_API_KEY.\n\nFull credentials are saved locally to:\n${chalk.cyan(credentialsPath)}\n\n${chalk.gray('Midscene does not collect your credentials.')}`,
    );
    return 0;
  } catch (error) {
    io.stderr(
      chalk.red(
        controller.signal.aborted
          ? `OpenAI ${action} cancelled or timed out.\n${describeSiwcError(error)}`
          : `OpenAI ${action} failed.\n${describeSiwcError(error)}`,
      ),
    );
    return 1;
  } finally {
    clearTimeout(timer);
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
    await unlock();
  }
}
