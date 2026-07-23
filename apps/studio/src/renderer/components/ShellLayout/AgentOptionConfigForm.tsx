import type {
  StudioAgentOptionKey,
  StudioAgentOptions,
} from '../../../shared/agent-options';

export type AgentOptionFormValues = Record<StudioAgentOptionKey, string>;

export function agentOptionsToFormValues(
  options: StudioAgentOptions,
): AgentOptionFormValues {
  return {
    replanningCycleLimit: options.replanningCycleLimit?.toString() ?? '',
    waitAfterAction: options.waitAfterAction?.toString() ?? '',
    screenshotShrinkFactor: options.screenshotShrinkFactor?.toString() ?? '',
  };
}

export function parseAgentOptionFormValues(
  values: AgentOptionFormValues,
):
  | { options: StudioAgentOptions; error: null }
  | { options: null; error: string } {
  const options: StudioAgentOptions = {};
  const replanningCycleLimit = values.replanningCycleLimit.trim();
  const waitAfterAction = values.waitAfterAction.trim();
  const screenshotShrinkFactor = values.screenshotShrinkFactor.trim();

  if (replanningCycleLimit) {
    const value = Number(replanningCycleLimit);
    if (!Number.isInteger(value) || value < 0) {
      return {
        options: null,
        error:
          'Replanning cycle limit must be an integer greater than or equal to 0.',
      };
    }
    options.replanningCycleLimit = value;
  }

  if (waitAfterAction) {
    const value = Number(waitAfterAction);
    if (!Number.isFinite(value) || value < 0) {
      return {
        options: null,
        error: 'Wait after action must be a number greater than or equal to 0.',
      };
    }
    options.waitAfterAction = value;
  }

  if (screenshotShrinkFactor) {
    const value = Number(screenshotShrinkFactor);
    if (!Number.isFinite(value) || value < 1) {
      return {
        options: null,
        error:
          'Screenshot shrink factor must be a number greater than or equal to 1.',
      };
    }
    options.screenshotShrinkFactor = value;
  }

  return { options, error: null };
}

const fields: Array<{
  key: StudioAgentOptionKey;
  label: string;
  placeholder: string;
  min: number;
  step: number;
}> = [
  {
    key: 'replanningCycleLimit',
    label: 'Replanning Cycle Limit',
    placeholder: 'Model default',
    min: 0,
    step: 1,
  },
  {
    key: 'waitAfterAction',
    label: 'Wait After Action (ms)',
    placeholder: 'Default: 300',
    min: 0,
    step: 1,
  },
  {
    key: 'screenshotShrinkFactor',
    label: 'Screenshot Shrink Factor',
    placeholder: 'Default: 1',
    min: 1,
    step: 0.1,
  },
];

export function AgentOptionConfigForm({
  values,
  onChange,
  error,
}: {
  values: AgentOptionFormValues;
  onChange: (key: StudioAgentOptionKey, value: string) => void;
  error?: string | null;
}) {
  return (
    <div className="px-[21px] pb-[16px]">
      <h3 className="m-0 mb-[12px] font-sans text-[14px] font-semibold leading-[20px] text-text-primary">
        Agent Option Config
      </h3>
      <div className="flex flex-col gap-[10px]">
        {fields.map((field) => (
          <label
            className="grid grid-cols-[1fr_180px] items-center gap-[16px]"
            key={field.key}
          >
            <span className="font-sans text-[12px] leading-[16px] text-text-secondary">
              {field.label}
            </span>
            <input
              aria-label={field.label}
              className="box-border h-[36px] w-full rounded-[8px] border border-border-control bg-surface-elevated px-[10px] font-sans text-[13px] text-text-primary outline-none placeholder:text-text-placeholder focus:border-brand"
              min={field.min}
              onChange={(event) => onChange(field.key, event.target.value)}
              placeholder={field.placeholder}
              step={field.step}
              type="number"
              value={values[field.key]}
            />
          </label>
        ))}
      </div>
      <p className="m-0 mt-[8px] font-sans text-[11px] leading-[14px] text-text-secondary">
        Leave a field empty to use the default value. Changes apply on the next
        Agent connection.
      </p>
      {error ? (
        <p className="m-0 mt-[6px] font-sans text-[11px] leading-[14px] text-[#E13E37]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
