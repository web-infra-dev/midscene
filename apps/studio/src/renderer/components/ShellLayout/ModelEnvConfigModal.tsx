import { useEffect, useMemo, useRef, useState } from 'react';
import { ModelEnvConfigFormFields } from './ModelEnvConfigFormFields';
import { ModelEnvConfigStatus } from './ModelEnvConfigStatus';
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
  | { kind: 'success' }
  | { kind: 'error' };

export interface ModelEnvConfigModalProps {
  open: boolean;
  initialTab?: TabKey;
  textValue?: string;
  onClose: () => void;
  onSave?: (payload: { text: string }) => void;
}

const TEXT_PLACEHOLDER = 'OPENAI_API_KEY=sk-...\nMIDSCENE_MODEL=';
const closeIconSrc = new URL('./model-env-close.svg', import.meta.url).href;
const connectivityIconSrc = new URL(
  './model-env-connectivity.svg',
  import.meta.url,
).href;

function ConnectivityPlayIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 shrink-0"
      fill="none"
      viewBox="0 0 16 16"
    >
      <path
        d="M5 8.00002V3.95856L8.5 5.97929L12 8.00002L8.5 10.0208L5 12.0415V8.00002Z"
        stroke="#333333"
        strokeLinejoin="round"
        strokeWidth="1.33333"
      />
    </svg>
  );
}

function EnvModalHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="relative z-10 box-border flex w-full items-center justify-between px-[20px] pt-[20.8px]">
      <h2 className="m-0 font-['Inter'] text-[16px] font-semibold leading-[24px] tracking-normal text-black">
        Model Env Config
      </h2>
      <button
        aria-label="Close"
        className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 transition-colors hover:bg-black/5"
        onClick={onClose}
        type="button"
      >
        <img alt="" aria-hidden="true" className="h-4 w-4" src={closeIconSrc} />
      </button>
    </div>
  );
}

function EnvModalTabs({
  tab,
  onTabChange,
}: {
  tab: TabKey;
  onTabChange: (tab: TabKey) => void;
}) {
  return (
    <div className="relative z-10 box-border flex h-[36px] w-[146px] items-center rounded-[42px] bg-[#F2F4F7] p-[2px]">
      <button
        className={`flex h-[32px] flex-1 cursor-pointer items-center justify-center rounded-[40px] border-0 p-0 font-['Inter'] text-[14px] leading-[16.9px] transition-all duration-200 ${
          tab === 'text'
            ? 'bg-white font-medium text-black shadow-[0_2px_4px_0_rgba(0,0,0,0.08)]'
            : 'bg-transparent font-normal text-black/70'
        }`}
        onClick={() => onTabChange('text')}
        type="button"
      >
        Text
      </button>
      <button
        className={`flex h-[32px] flex-1 cursor-pointer items-center justify-center rounded-[40px] border-0 p-0 font-['Inter'] text-[14px] leading-[16.9px] transition-all duration-200 ${
          tab === 'form'
            ? 'bg-white font-medium text-black shadow-[0_2px_4px_0_rgba(0,0,0,0.08)]'
            : 'bg-transparent font-normal text-black/70'
        }`}
        onClick={() => onTabChange('form')}
        type="button"
      >
        Form
      </button>
    </div>
  );
}

function EnvModalFooter({
  onCancel,
  onConnectivityTest,
  onSave,
  canRunConnectivityTest,
  testStatus,
}: {
  onCancel: () => void;
  onConnectivityTest: () => void;
  onSave: () => void;
  canRunConnectivityTest: boolean;
  testStatus: TestStatus;
}) {
  const isTesting = testStatus.kind === 'running';
  const connectivityLabel = isTesting ? 'Testing...' : 'Connectivity test';

  return (
    <div className="relative z-10 mt-auto box-border flex w-full items-center justify-between px-[20px] pb-[24px]">
      <button
        className={`flex h-[32px] w-[159px] items-center gap-[4px] rounded-[8px] border border-black/12 bg-white px-[12px] py-0 ${
          isTesting
            ? 'cursor-not-allowed opacity-60'
            : canRunConnectivityTest
              ? 'cursor-pointer hover:bg-gray-50'
              : 'cursor-not-allowed'
        }`}
        disabled={!canRunConnectivityTest || isTesting}
        onClick={onConnectivityTest}
        type="button"
      >
        {isTesting ? (
          <img
            alt=""
            className="h-4 w-4 animate-spin"
            src={connectivityIconSrc}
          />
        ) : (
          <ConnectivityPlayIcon />
        )}
        <span className="w-[115px] overflow-hidden whitespace-nowrap text-left font-['Inter'] text-[14px] font-medium text-black leading-[16px]">
          {connectivityLabel}
        </span>
      </button>

      <div className="flex items-center gap-[8px]">
        <button
          className="flex h-[32px] w-[76px] cursor-pointer items-center justify-center rounded-[8px] border-0 bg-[#F0F2F5] p-0 hover:bg-gray-200"
          onClick={onCancel}
          type="button"
        >
          <span className="w-[47px] overflow-hidden whitespace-nowrap text-center font-['Inter'] text-[14px] font-medium leading-[16px] text-black/70">
            Cancel
          </span>
        </button>
        <button
          className="flex h-[32px] w-[76px] cursor-pointer items-center justify-center rounded-[8px] border border-[#2B84FF] bg-[#2B84FF] p-0 hover:opacity-90"
          onClick={onSave}
          type="button"
        >
          <span className="w-[33px] overflow-hidden whitespace-nowrap text-center font-['Inter'] text-[14px] font-medium leading-[16px] text-white">
            Save
          </span>
        </button>
      </div>
    </div>
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
  const testRunIdRef = useRef(0);

  useEffect(() => {
    if (!open) {
      return;
    }

    testRunIdRef.current += 1;
    setTab(initialTab);
    setText(initialTextValue ?? '');
    setTestStatus({ kind: 'idle' });
  }, [initialTab, initialTextValue, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const formEntries = useMemo<EnvEntry[]>(() => parseEnvEntries(text), [text]);
  const resolvedConnection = useMemo(
    () => resolveModelConnection(parseEnvText(text)),
    [text],
  );
  const canRunConnectivityTest = !('error' in resolvedConnection);
  const isExpandedForm = tab === 'form' && formEntries.length > 0;
  const hasTestStatus =
    testStatus.kind === 'success' || testStatus.kind === 'error';
  const modalHeightClass =
    isExpandedForm && hasTestStatus
      ? 'h-[603px]'
      : isExpandedForm
        ? 'h-[563px]'
        : hasTestStatus
          ? 'h-[444px]'
          : 'h-[404px]';
  const modalVerticalOffsetClass =
    isExpandedForm && hasTestStatus
      ? 'translate-y-[99.5px]'
      : isExpandedForm
        ? 'translate-y-[79.5px]'
        : hasTestStatus
          ? 'translate-y-[20px]'
          : '';
  const descriptionMarginClass = isExpandedForm
    ? 'mt-[20px]'
    : hasTestStatus
      ? 'mt-[12px]'
      : 'mt-[16px]';

  if (!open) {
    return null;
  }

  const handleTextChange = (nextText: string) => {
    testRunIdRef.current += 1;
    setText(nextText);
    setTestStatus((currentStatus) =>
      currentStatus.kind === 'idle' ? currentStatus : { kind: 'idle' },
    );
  };

  const updateFormEntry = (
    index: number,
    patch: { key?: string; value?: string },
  ) => {
    const next = formEntries.map((entry, entryIndex) =>
      entryIndex === index ? { ...entry, ...patch } : entry,
    );
    handleTextChange(serializeEnvEntries(next));
  };

  const handleConnectivityTest = async () => {
    if (testStatus.kind === 'running' || 'error' in resolvedConnection) {
      return;
    }

    if (!window.studioRuntime) {
      setTestStatus({ kind: 'error' });
      return;
    }

    const testRunId = testRunIdRef.current + 1;
    testRunIdRef.current = testRunId;
    setTestStatus({ kind: 'running' });
    try {
      const result =
        await window.studioRuntime.runConnectivityTest(resolvedConnection);
      if (testRunIdRef.current !== testRunId) {
        return;
      }
      setTestStatus({ kind: result.ok ? 'success' : 'error' });
    } catch {
      if (testRunIdRef.current !== testRunId) {
        return;
      }
      setTestStatus({ kind: 'error' });
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
        className={`relative box-border flex ${modalHeightClass} w-[400px] ${modalVerticalOffsetClass} flex-col overflow-hidden rounded-[16px] bg-white shadow-lg`}
        onClick={(event) => event.stopPropagation()}
      >
        <EnvModalHeader onClose={onClose} />
        <div className="mt-[19.2px] px-[21px]">
          <EnvModalTabs onTabChange={setTab} tab={tab} />
        </div>

        {tab === 'text' ? (
          <div className="relative z-10 mt-[16px] flex w-full justify-center">
            <textarea
              className="box-border h-[162px] w-[360px] resize-none overflow-hidden rounded-[12px] border border-[#EFEFEE] bg-white p-[12px] font-['Inter'] text-[14px] font-normal leading-[16.9px] text-black placeholder:text-black/35 outline-none"
              onChange={(event) => handleTextChange(event.target.value)}
              placeholder={TEXT_PLACEHOLDER}
              value={text}
              wrap="off"
            />
          </div>
        ) : formEntries.length === 0 ? (
          <div className="relative z-10 mt-[16px] flex w-full justify-center">
            <div className="box-border flex h-[162px] w-[360px] items-center justify-center rounded-[12px] border border-[#EFEFEE] bg-white px-[16px] text-center font-['Inter'] text-[13px] leading-[18px] text-black/45">
              Add KEY=VALUE lines in the Text tab to populate fields here.
            </div>
          </div>
        ) : (
          <ModelEnvConfigFormFields
            entries={formEntries}
            onEntryChange={updateFormEntry}
          />
        )}

        <div className={`relative z-10 ${descriptionMarginClass} px-[21px]`}>
          <p className="m-0 font-['Inter'] text-[12px] font-normal leading-[14.5px] text-black/65">
            The format is KEY=VALUE and separated by new lines. These data will
            be saved{' '}
            <span className="font-bold text-black">
              locally in your browser
            </span>
            .
          </p>
        </div>

        {hasTestStatus ? <ModelEnvConfigStatus kind={testStatus.kind} /> : null}

        <EnvModalFooter
          canRunConnectivityTest={canRunConnectivityTest}
          onCancel={onClose}
          onConnectivityTest={handleConnectivityTest}
          onSave={() => onSave?.({ text })}
          testStatus={testStatus}
        />
      </div>
    </div>
  );
}
