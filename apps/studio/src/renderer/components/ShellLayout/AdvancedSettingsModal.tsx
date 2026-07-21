import {
  type StudioAgentOptionsV1,
  type StudioRuntimeSettingsV1,
  normalizeStudioRuntimeSettings,
} from '@shared/advanced-settings';
import { useEffect, useState } from 'react';

export interface AdvancedSettingsModalProps {
  open: boolean;
  runtimeReady: boolean;
  settings: StudioRuntimeSettingsV1;
  onApply: (settings: StudioRuntimeSettingsV1) => Promise<void>;
  onClose: () => void;
}

type NumericAgentOption =
  | 'replanningCycleLimit'
  | 'screenshotShrinkFactor'
  | 'waitAfterAction';

function optionalNumber(value: string): number | undefined {
  return value.trim() ? Number(value) : undefined;
}

export function AdvancedSettingsModal({
  onApply,
  onClose,
  open,
  runtimeReady,
  settings,
}: AdvancedSettingsModalProps) {
  const [draft, setDraft] = useState<StudioAgentOptionsV1>({});
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft({ ...settings.agentOptions });
    setApplying(false);
    setError(null);
  }, [open, settings]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !applying) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [applying, onClose, open]);

  if (!open) return null;

  const setNumericOption = (key: NumericAgentOption, value: string) => {
    setDraft((current) => ({
      ...current,
      [key]: optionalNumber(value),
    }));
    setError(null);
  };

  const handleApply = async () => {
    setError(null);
    setApplying(true);
    try {
      const normalized = normalizeStudioRuntimeSettings({
        schemaVersion: 1,
        agentOptions: draft,
      });
      await onApply(normalized);
    } catch (applyError) {
      setError(
        applyError instanceof Error ? applyError.message : String(applyError),
      );
    } finally {
      setApplying(false);
    }
  };

  const numberInputClass =
    'box-border h-[34px] w-full rounded-[6px] border border-border-control bg-surface-elevated px-[10px] text-[13px] text-text-primary outline-none focus:border-brand';

  return (
    <dialog
      aria-modal="true"
      className="fixed inset-0 z-[1000] m-0 h-screen w-screen max-h-none max-w-none items-center justify-center border-0 bg-black/35 p-0 font-sans open:flex"
      onClick={() => {
        if (!applying) onClose();
      }}
      open
    >
      <div
        className="box-border flex max-h-[calc(100vh-32px)] w-[560px] max-w-[calc(100vw-32px)] flex-col rounded-[8px] border border-border-subtle bg-surface-elevated shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-divider px-[20px] py-[16px]">
          <h2 className="m-0 text-[16px] font-semibold text-text-primary">
            Advanced Settings
          </h2>
          <button
            aria-label="Close"
            className="h-[24px] w-[24px] cursor-pointer border-0 bg-transparent p-0 text-[20px] leading-[24px] text-text-secondary hover:text-text-primary"
            disabled={applying}
            onClick={onClose}
            type="button"
          >
            &times;
          </button>
        </div>

        <div className="grid min-h-0 grid-cols-2 gap-x-[16px] gap-y-[14px] overflow-y-auto px-[20px] py-[18px]">
          <label className="flex min-w-0 flex-col gap-[6px] text-[12px] text-text-secondary">
            Replanning cycle limit
            <input
              className={numberInputClass}
              min={0}
              onChange={(event) =>
                setNumericOption('replanningCycleLimit', event.target.value)
              }
              placeholder="Use default"
              step={1}
              type="number"
              value={draft.replanningCycleLimit ?? ''}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-[6px] text-[12px] text-text-secondary">
            Wait after action (ms)
            <input
              className={numberInputClass}
              min={0}
              onChange={(event) =>
                setNumericOption('waitAfterAction', event.target.value)
              }
              placeholder="Use default"
              step="any"
              type="number"
              value={draft.waitAfterAction ?? ''}
            />
          </label>
          <label className="col-span-2 flex min-w-0 flex-col gap-[6px] text-[12px] text-text-secondary">
            Screenshot shrink factor
            <input
              className={numberInputClass}
              min={1}
              onChange={(event) =>
                setNumericOption('screenshotShrinkFactor', event.target.value)
              }
              placeholder="Use default"
              step="any"
              type="number"
              value={draft.screenshotShrinkFactor ?? ''}
            />
          </label>
          <label className="col-span-2 flex min-w-0 flex-col gap-[6px] text-[12px] text-text-secondary">
            AI action context
            <textarea
              className="box-border h-[92px] w-full resize-y rounded-[6px] border border-border-control bg-surface-elevated p-[10px] text-[13px] leading-[18px] text-text-primary outline-none focus:border-brand"
              onChange={(event) => {
                const value = event.target.value;
                setDraft((current) => ({
                  ...current,
                  aiActContext: value,
                }));
                setError(null);
              }}
              placeholder="Use default"
              value={draft.aiActContext ?? ''}
            />
          </label>

          {runtimeReady ? (
            <p className="col-span-2 m-0 rounded-[6px] bg-surface-muted px-[10px] py-[8px] text-[12px] leading-[18px] text-text-secondary">
              Applying settings disconnects the current target and restarts the
              runtime.
            </p>
          ) : null}
          {error ? (
            <p className="col-span-2 m-0 text-[12px] leading-[18px] text-[#e13e37]">
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex justify-between border-t border-divider px-[20px] py-[14px]">
          <button
            className="h-[32px] cursor-pointer rounded-[6px] border border-border-control bg-transparent px-[12px] text-[13px] text-text-secondary hover:bg-surface-hover"
            disabled={applying}
            onClick={() => {
              setDraft({});
              setError(null);
            }}
            type="button"
          >
            Reset to defaults
          </button>
          <div className="flex gap-[8px]">
            <button
              className="h-[32px] cursor-pointer rounded-[6px] border border-border-control bg-transparent px-[14px] text-[13px] text-text-primary hover:bg-surface-hover"
              disabled={applying}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="h-[32px] cursor-pointer rounded-[6px] border border-brand bg-brand px-[14px] text-[13px] text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={applying}
              onClick={() => void handleApply()}
              type="button"
            >
              {applying ? 'Applying...' : 'Apply'}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
