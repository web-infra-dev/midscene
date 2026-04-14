import { useMemo, useState } from 'react';
import {
  type EnvEntry,
  parseEnvEntries,
  parseEnvText,
  resolveModelConnection,
  serializeEnvEntries,
} from './connectivity-env';

type TabKey = 'text' | 'form';

type TestStatus =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'success'; sample: string }
  | { kind: 'error'; message: string };

export interface ModelEnvConfigModalProps {
  open: boolean;
  initialTab?: TabKey;
  textValue?: string;
  onClose: () => void;
  onSave?: (payload: { text: string }) => void;
}

const TEXT_PLACEHOLDER = 'OPENAI_API_KEY=sk-...\nMIDSCENE_MODEL=';

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <path
        d="M4 4L12 12M12 4L4 12"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg
      aria-hidden="true"
      className="shrink-0"
      fill="none"
      height="12"
      viewBox="0 0 12 12"
      width="12"
    >
      <path d="M3.5 2v8l5.5-4-5.5-4z" fill="currentColor" />
    </svg>
  );
}

function StatusDotIcon({ color }: { color: string }) {
  return (
    <svg
      aria-hidden="true"
      className="block"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <circle cx="8" cy="8" fill={color} r="7" />
      <path d="M8 4v5" stroke="white" strokeLinecap="round" strokeWidth="1.4" />
      <circle cx="8" cy="11.5" fill="white" r="0.9" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

export function ModelEnvConfigModal({
  open,
  initialTab = 'text',
  textValue: initialTextValue,
  onClose,
  onSave,
}: ModelEnvConfigModalProps) {
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [text, setText] = useState(initialTextValue ?? '');
  const [testStatus, setTestStatus] = useState<TestStatus>({ kind: 'idle' });

  const formEntries = useMemo<EnvEntry[]>(() => parseEnvEntries(text), [text]);

  const statusBanner = useMemo(() => {
    if (testStatus.kind === 'running') {
      return {
        color: 'var(--studio-status-info)',
        background: 'var(--studio-status-info-bg)',
        message: 'Running connectivity test...',
      };
    }
    if (testStatus.kind === 'success') {
      return {
        color: 'var(--studio-status-success-fg)',
        background: 'var(--studio-status-success-bg)',
        message: `Connectivity test passed: "${testStatus.sample.slice(0, 80)}"`,
      };
    }
    if (testStatus.kind === 'error') {
      return {
        color: 'var(--studio-status-error)',
        background: 'var(--studio-status-error-bg)',
        message: testStatus.message,
      };
    }
    return null;
  }, [testStatus]);

  if (!open) {
    return null;
  }

  const updateFormEntry = (
    index: number,
    patch: { key?: string; value?: string },
  ) => {
    const next = formEntries.map((entry, entryIndex) =>
      entryIndex === index ? { ...entry, ...patch } : entry,
    );
    setText(serializeEnvEntries(next));
  };

  const handleConnectivityTest = async () => {
    const env = parseEnvText(text);
    const resolved = resolveModelConnection(env);
    if ('error' in resolved) {
      setTestStatus({ kind: 'error', message: resolved.error });
      return;
    }

    if (!window.studioRuntime) {
      setTestStatus({
        kind: 'error',
        message: 'Studio runtime bridge is unavailable.',
      });
      return;
    }

    setTestStatus({ kind: 'running' });
    const result = await window.studioRuntime.runConnectivityTest(resolved);
    if (result.ok) {
      setTestStatus({ kind: 'success', sample: result.sample });
    } else {
      setTestStatus({ kind: 'error', message: result.error });
    }
  };

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/35"
      onClick={onClose}
      // biome-ignore lint/a11y/useSemanticElements: overlay wrapper styled as backdrop; card below carries the dialog semantics
      role="dialog"
    >
      <div
        className="relative flex w-[400px] flex-col overflow-hidden rounded-[16px] bg-surface-elevated shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-[20px] pb-[16px] pt-[20px]">
          <span className="font-['Inter'] text-[16px] font-semibold leading-[24px] text-text-primary">
            Model Env Config
          </span>
          <button
            aria-label="Close"
            className="flex h-4 w-4 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-text-tertiary hover:text-text-primary"
            onClick={onClose}
            type="button"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="px-[20px]">
          <div className="flex h-[36px] w-[146px] items-center rounded-[12px] bg-surface-muted p-[2px]">
            <button
              className={`flex h-full flex-1 cursor-pointer items-center justify-center rounded-[10px] border-0 text-[14px] font-['Inter'] ${
                tab === 'text'
                  ? 'bg-surface-elevated font-medium text-text-primary shadow-sm'
                  : 'bg-transparent font-normal text-text-secondary'
              }`}
              onClick={() => setTab('text')}
              type="button"
            >
              Text
            </button>
            <button
              className={`flex h-full flex-1 cursor-pointer items-center justify-center rounded-[10px] border-0 text-[14px] font-['Inter'] ${
                tab === 'form'
                  ? 'bg-surface-elevated font-medium text-text-primary shadow-sm'
                  : 'bg-transparent font-normal text-text-secondary'
              }`}
              onClick={() => setTab('form')}
              type="button"
            >
              Form
            </button>
          </div>
        </div>

        <div className="mt-[16px] px-[20px]">
          {tab === 'text' ? (
            <textarea
              className="box-border h-[162px] w-full resize-none rounded-[12px] border-0 bg-surface-muted p-[12px] font-['Inter'] text-[14px] leading-[20px] text-text-primary placeholder:text-text-placeholder outline-none"
              onChange={(event) => setText(event.target.value)}
              placeholder={TEXT_PLACEHOLDER}
              value={text}
              wrap="off"
            />
          ) : formEntries.length === 0 ? (
            <div className="flex h-[162px] items-center justify-center rounded-[12px] bg-surface-muted text-[13px] text-text-tertiary">
              Add KEY=VALUE lines in the Text tab to populate fields here.
            </div>
          ) : (
            <div className="flex max-h-[316px] flex-col gap-[16px] overflow-auto pr-[2px]">
              {formEntries.map((entry, index) => (
                <div
                  className="flex flex-col gap-[8px]"
                  key={`${entry.key}-${index}`}
                >
                  <input
                    aria-label={`${entry.key} key`}
                    className="box-border w-full border-0 bg-transparent font-['PingFang_SC'] text-[14px] leading-[19.6px] text-text-primary outline-none"
                    onChange={(event) =>
                      updateFormEntry(index, { key: event.target.value })
                    }
                    value={entry.key}
                  />
                  <div className="box-border flex min-h-[36px] items-center justify-between rounded-[8px] bg-surface-muted px-[12px] py-[8px]">
                    <input
                      aria-label={`${entry.key} value`}
                      className="box-border w-full flex-1 border-0 bg-transparent font-['Inter'] text-[14px] leading-[16.9px] text-text-primary outline-none"
                      onChange={(event) =>
                        updateFormEntry(index, { value: event.target.value })
                      }
                      value={entry.value}
                    />
                    <div className="ml-2 flex h-4 w-4 shrink-0 items-center justify-center text-text-tertiary">
                      <ChevronIcon />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-[12px] px-[20px]">
          <p className="font-['Inter'] text-[12px] leading-[14.5px] text-text-secondary">
            The format is KEY=VALUE and separated by new lines. These data will
            be saved{' '}
            <span className="font-bold text-text-primary">
              locally in your browser
            </span>
            .
          </p>
        </div>

        {statusBanner ? (
          <div className="mt-[12px] px-[20px]">
            <div
              className="flex items-start gap-[10px] rounded-[8px] px-[12px] py-[8px]"
              style={{ backgroundColor: statusBanner.background }}
            >
              <div className="mt-[2px]">
                <StatusDotIcon color={statusBanner.color} />
              </div>
              <span
                className="break-words font-['Inter'] text-[13px] font-medium leading-[18px]"
                style={{ color: statusBanner.color }}
              >
                {statusBanner.message}
              </span>
            </div>
          </div>
        ) : null}

        <div className="mt-[24px] flex items-center justify-between px-[20px] pb-[20px]">
          <button
            className="flex h-[32px] w-[159px] cursor-pointer items-center justify-center gap-[6px] rounded-[8px] border border-border-strong bg-surface-elevated px-[12px] text-text-primary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
            disabled={testStatus.kind === 'running'}
            onClick={handleConnectivityTest}
            type="button"
          >
            <PlayIcon />
            <span className="font-['Inter'] text-[14px] font-medium leading-none">
              {testStatus.kind === 'running'
                ? 'Testing...'
                : 'Connectivity test'}
            </span>
          </button>

          <div className="flex items-center gap-[8px]">
            <button
              className="flex h-[32px] w-[76px] cursor-pointer items-center justify-center rounded-[8px] border-0 bg-surface-muted hover:bg-surface-hover-strong"
              onClick={onClose}
              type="button"
            >
              <span className="font-['Inter'] text-[14px] font-medium leading-[16px] text-text-secondary">
                Cancel
              </span>
            </button>
            <button
              className="flex h-[32px] w-[76px] cursor-pointer items-center justify-center rounded-[8px] border-0 bg-brand hover:opacity-90"
              onClick={() => onSave?.({ text })}
              type="button"
            >
              <span className="font-['Inter'] text-[14px] font-medium leading-[16px] text-white">
                Save
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
