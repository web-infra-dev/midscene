import { Tooltip } from 'antd';
import React, { type ReactNode, useState } from 'react';

const INSTALL_CHROME_COMMAND = 'npx puppeteer browsers install chrome';
const PUPPETEER_CONFIGURATION_URL = 'https://pptr.dev/guides/configuration';
const CHROME_MISSING_RE = /could not find (?:google )?chrome/;

interface CreateAgentErrorNotification {
  title: string;
  description: ReactNode;
  duration: number;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.toString();
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === 'string') {
      return value;
    }
  }
  return String(error);
}

function copyInstallCommand() {
  if (typeof navigator === 'undefined') {
    return;
  }

  try {
    void navigator.clipboard
      ?.writeText(INSTALL_CHROME_COMMAND)
      .catch(() => undefined);
  } catch {
    // Clipboard access can be unavailable or denied; copying is best-effort.
  }
}

function CopyIcon() {
  return (
    <span
      aria-hidden
      style={{
        display: 'block',
        height: 16,
        position: 'relative',
        width: 16,
      }}
    >
      <span
        style={{
          border: '1.5px solid currentColor',
          borderRadius: 3,
          height: 10,
          left: 5,
          position: 'absolute',
          top: 3,
          width: 8,
        }}
      />
      <span
        style={{
          background: '#f6f8fa',
          border: '1.5px solid currentColor',
          borderRadius: 3,
          height: 10,
          left: 2,
          position: 'absolute',
          top: 0,
          width: 8,
        }}
      />
    </span>
  );
}

export function isPuppeteerChromeMissingError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    CHROME_MISSING_RE.test(message) &&
    (message.includes('puppeteer browsers install chrome') ||
      message.includes('cache path') ||
      message.includes('puppeteer'))
  );
}

function ChromeMissingDescription({ error }: { error: unknown }) {
  const rawMessage = getErrorMessage(error);
  const [copyVisible, setCopyVisible] = useState(false);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div>
        Studio could not find the Chrome browser required to create a Web Agent.
      </div>
      <div>Run this command, then try again:</div>
      <div
        onMouseEnter={() => setCopyVisible(true)}
        onMouseLeave={() => setCopyVisible(false)}
        style={{
          background: '#f6f8fa',
          border: '1px solid #d9d9d9',
          borderRadius: 6,
          boxSizing: 'border-box',
          maxWidth: '100%',
          minHeight: 46,
          position: 'relative',
        }}
      >
        <pre
          style={{
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: 14,
            lineHeight: 1.4,
            margin: 0,
            overflowX: 'auto',
            padding: '12px 44px 12px 12px',
            whiteSpace: 'nowrap',
          }}
        >
          {INSTALL_CHROME_COMMAND}
        </pre>
        <button
          aria-label="Copy install command"
          onBlur={() => setCopyVisible(false)}
          onClick={copyInstallCommand}
          onFocus={() => setCopyVisible(true)}
          style={{
            alignItems: 'center',
            background: '#ffffff',
            border: '1px solid #d9d9d9',
            borderRadius: 6,
            bottom: 7,
            color: '#555',
            cursor: 'pointer',
            display: 'inline-flex',
            height: 28,
            justifyContent: 'center',
            opacity: copyVisible ? 1 : 0,
            padding: 0,
            pointerEvents: copyVisible ? 'auto' : 'none',
            position: 'absolute',
            right: 7,
            transition: 'opacity 120ms ease',
            width: 28,
          }}
          title="Copy command"
          type="button"
        >
          <CopyIcon />
        </button>
      </div>
      <div>
        Guide:{' '}
        <a href={PUPPETEER_CONFIGURATION_URL} rel="noreferrer" target="_blank">
          {PUPPETEER_CONFIGURATION_URL}
        </a>
      </div>
      <Tooltip
        getPopupContainer={() => document.body}
        overlayInnerStyle={{
          width: 'min(680px, calc(100vw - 48px))',
        }}
        overlayStyle={{
          maxWidth: 'min(680px, calc(100vw - 48px))',
        }}
        placement="topRight"
        title={
          <pre
            style={{
              margin: 0,
              maxHeight: 280,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              width: '100%',
            }}
          >
            {rawMessage}
          </pre>
        }
        zIndex={10_000}
      >
        <button
          style={{
            alignSelf: 'flex-start',
            background: 'transparent',
            border: 0,
            color: 'inherit',
            cursor: 'help',
            padding: 0,
            textDecoration: 'underline',
          }}
          type="button"
        >
          Original error
        </button>
      </Tooltip>
    </div>
  );
}

export function getCreateAgentErrorNotification(
  error: unknown,
): CreateAgentErrorNotification | undefined {
  if (!isPuppeteerChromeMissingError(error)) {
    return undefined;
  }

  return {
    description: <ChromeMissingDescription error={error} />,
    duration: 0,
    title: 'Failed to create Agent',
  };
}
