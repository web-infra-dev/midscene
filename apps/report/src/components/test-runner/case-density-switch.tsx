import type { RunnerCaseDisplayMode } from './view-primitives';

const options: Array<{ label: string; value: RunnerCaseDisplayMode }> = [
  { label: 'Compact', value: 'compact' },
  { label: 'Detailed', value: 'detailed' },
];

export function CaseDensitySwitch({
  value,
  onChange,
}: {
  value: RunnerCaseDisplayMode;
  onChange(value: RunnerCaseDisplayMode): void;
}): JSX.Element {
  return (
    <fieldset
      className="runner-breakdown-view-switch"
      aria-label="Case row density"
    >
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          className={value === option.value ? 'is-selected' : ''}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}
