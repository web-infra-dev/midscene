import type { EnvEntry } from './connectivity-env';

type EntryPatch = { key?: string; value?: string };

interface ModelEnvConfigFormFieldsProps {
  entries: EnvEntry[];
  onEntryChange: (index: number, patch: EntryPatch) => void;
}

function FormFieldChevronIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 16 16">
      <path
        d="M12 6L8 10L4 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.33333"
      />
    </svg>
  );
}

function ModelEnvConfigFormItem({
  entry,
  index,
  onEntryChange,
}: {
  entry: EnvEntry;
  index: number;
  onEntryChange: (index: number, patch: EntryPatch) => void;
}) {
  return (
    <div className="flex h-[61px] w-full flex-col overflow-visible">
      <input
        aria-label={`${entry.key || 'env'} key`}
        className="mb-[8px] h-[20px] w-full overflow-hidden whitespace-nowrap border-0 bg-transparent text-[14px] text-black/90 font-['Inter'] font-normal leading-[19.6px] outline-none"
        onChange={(event) => onEntryChange(index, { key: event.target.value })}
        value={entry.key}
      />
      <div className="box-border flex h-[36px] px-[12px] w-full items-center justify-between rounded-[8px] border border-[#EFEFEE] bg-white">
        <input
          aria-label={`${entry.key || 'env'} value`}
          className="h-[17px] w-full flex-1 overflow-hidden whitespace-nowrap border-0 bg-transparent font-['Inter'] text-[14px] font-normal leading-[16.9px] text-black outline-none"
          onChange={(event) =>
            onEntryChange(index, { value: event.target.value })
          }
          value={entry.value}
        />
        <div className="ml-2 flex h-4 w-4 shrink-0 items-center justify-center text-black/45">
          <FormFieldChevronIcon />
        </div>
      </div>
    </div>
  );
}

export function ModelEnvConfigFormFields({
  entries,
  onEntryChange,
}: ModelEnvConfigFormFieldsProps) {
  return (
    <div className="relative z-10 mt-[16px] px-[20px]">
      <div className="flex flex-col gap-[24px] max-h-[316px] overflow-auto">
        {entries.map((entry, index) => (
          <ModelEnvConfigFormItem
            entry={entry}
            index={index}
            key={`${entry.key}-${index}`}
            onEntryChange={onEntryChange}
          />
        ))}
      </div>
    </div>
  );
}
