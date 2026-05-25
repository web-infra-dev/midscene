import { FIXED_MODEL_ENV_FIELDS } from './connectivity-env';

interface ModelEnvConfigFormFieldsProps {
  values: Record<string, string>;
  onFieldChange: (key: string, value: string) => void;
}

function ModelEnvConfigFormItem({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex h-[61px] w-full flex-col overflow-visible">
      <div
        aria-hidden="true"
        className="mb-[8px] h-[20px] w-full overflow-hidden whitespace-nowrap font-sans text-[14px] font-normal leading-[19.6px] text-text-primary"
      >
        {label}
      </div>
      <div className="box-border flex h-[36px] px-[12px] w-full items-center justify-between rounded-[8px] border border-border-subtle bg-surface-elevated">
        <input
          aria-label={`${label} value`}
          className="h-[17px] w-full flex-1 overflow-hidden whitespace-nowrap border-0 bg-transparent font-sans text-[14px] font-normal leading-[16.9px] text-text-primary outline-none placeholder:text-text-placeholder"
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
      </div>
    </div>
  );
}

export function ModelEnvConfigFormFields({
  values,
  onFieldChange,
}: ModelEnvConfigFormFieldsProps) {
  return (
    <div className="relative z-10 mt-[16px] px-[20px]">
      <div className="flex flex-col gap-[24px] max-h-[316px] overflow-auto">
        {FIXED_MODEL_ENV_FIELDS.map((field) => (
          <ModelEnvConfigFormItem
            key={field.key}
            label={field.key}
            onChange={(value) => onFieldChange(field.key, value)}
            placeholder={field.placeholder}
            value={values[field.key] ?? ''}
          />
        ))}
      </div>
    </div>
  );
}
