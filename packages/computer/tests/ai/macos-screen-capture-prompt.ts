import { execFileSync } from 'node:child_process';

interface ScreenshotDevice {
  screenshotBase64(): Promise<string>;
}

interface PromptInspection {
  status: 'absent' | 'accepted' | 'blocked';
  processName?: string;
  message: string;
}

const PROMPT_SETTLE_MS = 750;
const MAX_ATTEMPTS = 4;

function inspectAndDismissScreenCapturePrivacyPrompt(): PromptInspection {
  const output = execFileSync(
    'osascript',
    [
      '-l',
      'JavaScript',
      '-e',
      String.raw`
function run() {
  const systemEvents = Application('System Events');
  const processes = systemEvents.applicationProcesses();

  function safe(fn) {
    try {
      return fn();
    } catch (error) {
      return undefined;
    }
  }

  function text(value) {
    return value === undefined || value === null ? '' : String(value);
  }

  function attr(element, name) {
    return safe(function () {
      return element.attributes.byName(name).value();
    });
  }

  function labelsOf(element) {
    return [
      safe(function () { return element.name(); }),
      safe(function () { return element.description(); }),
      attr(element, 'AXTitle'),
      attr(element, 'AXDescription'),
      attr(element, 'AXValue'),
    ].map(text).filter(Boolean);
  }

  function isPromptHostProcessName(name) {
    const normalized = name.toLowerCase();
    return (
      normalized.includes('notificationcenter') ||
      normalized.includes('screencapture') ||
      normalized.includes('uiagent') ||
      normalized.includes('securityagent') ||
      normalized === 'windowmanager' ||
      normalized === 'systemuiserver' ||
      normalized === 'controlcenter'
    );
  }

  function inspect(element, depth, state) {
    state.visited += 1;
    const labels = labelsOf(element);
    const normalized = labels.join(' ').toLowerCase();
    const role = text(safe(function () { return element.role(); }));

    if (
      normalized.includes('private window picker') ||
      normalized.includes('access your screen and audio') ||
      normalized.includes('requesting to bypass')
    ) {
      state.hasPromptText = true;
    }

    if (role === 'AXButton') {
      state.buttonLabels.push(labels.join(' | '));
      if (labels.some(function (label) {
        return label === 'Allow' || label === 'Allow For One Month';
      })) {
        state.allowButton = element;
      }
      if (labels.some(function (label) {
        return label === 'Open System Settings';
      })) {
        state.hasSystemSettingsButton = true;
      }
    }

    if (depth >= 8 || state.visited >= 500) return;
    const children = safe(function () { return element.uiElements(); }) || [];
    for (let index = 0; index < children.length; index += 1) {
      inspect(children[index], depth + 1, state);
    }
  }

  const scanned = [];
  const blocked = [];
  for (let processIndex = 0; processIndex < processes.length; processIndex += 1) {
    const process = processes[processIndex];
    const processName = text(safe(function () { return process.name(); })) || '<unnamed>';
    if (!isPromptHostProcessName(processName)) continue;
    const windows = safe(function () { return process.windows(); }) || [];
    if (!windows.length) continue;

    scanned.push(processName);
    for (let windowIndex = 0; windowIndex < windows.length; windowIndex += 1) {
      const state = {
        allowButton: undefined,
        buttonLabels: [],
        hasPromptText: false,
        hasSystemSettingsButton: false,
        visited: 0,
      };
      inspect(windows[windowIndex], 0, state);
      const isScreenCapturePrompt =
        state.hasPromptText ||
        (state.allowButton && state.hasSystemSettingsButton);
      if (!isScreenCapturePrompt) continue;

      if (state.allowButton) {
        state.allowButton.click();
        return JSON.stringify({
          status: 'accepted',
          processName: processName,
          message: 'Accepted screen capture privacy prompt in ' + processName,
        });
      }
      blocked.push(
        processName + ': ' + state.buttonLabels.slice(0, 20).join('; '),
      );
    }
  }

  if (blocked.length) {
    return JSON.stringify({
      status: 'blocked',
      message:
        'Found screen capture privacy prompt without an accessible Allow button. ' +
        blocked.join(' | '),
    });
  }
  return JSON.stringify({
    status: 'absent',
    message:
      'Screen capture privacy prompt was not present. Scanned prompt host processes: ' +
      scanned.join(', '),
  });
}
`,
    ],
    { encoding: 'utf8', timeout: 10_000 },
  ).trim();

  return JSON.parse(output) as PromptInspection;
}

export async function prepareMacosScreenCapture(
  device: ScreenshotDevice,
): Promise<string> {
  const diagnostics: string[] = [];
  let acceptedPrompt = false;
  let consecutiveAbsentChecks = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await device.screenshotBase64();
    await new Promise((resolve) => setTimeout(resolve, PROMPT_SETTLE_MS));
    const result = inspectAndDismissScreenCapturePrivacyPrompt();
    diagnostics.push(`Attempt ${attempt}: ${result.message}`);

    if (result.status === 'blocked') {
      throw new Error(diagnostics.join('\n'));
    }
    if (result.status === 'absent') {
      consecutiveAbsentChecks += 1;
      if (acceptedPrompt || consecutiveAbsentChecks >= 2) {
        return diagnostics.join('\n');
      }
      await new Promise((resolve) => setTimeout(resolve, PROMPT_SETTLE_MS));
      continue;
    }

    acceptedPrompt = true;
    consecutiveAbsentChecks = 0;
    await new Promise((resolve) => setTimeout(resolve, PROMPT_SETTLE_MS));
  }

  throw new Error(
    `${diagnostics.join('\n')}\nScreen capture privacy prompt remained after ${MAX_ATTEMPTS} attempts${
      acceptedPrompt ? '' : ' without an accessible dismissal action'
    }.`,
  );
}
