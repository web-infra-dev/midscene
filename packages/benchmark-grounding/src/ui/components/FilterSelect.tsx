import * as Select from '@radix-ui/react-select';
import { flushSync } from 'react-dom';

export function FilterSelect({
  id,
  label,
  value,
  options,
  open,
  onOpenChange,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; text: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
}) {
  return (
    <Select.Root
      value={JSON.stringify(value)}
      open={open}
      onOpenChange={onOpenChange}
      onValueChange={(value) => onChange(JSON.parse(value))}
    >
      <label className="filter-field" htmlFor={`${id}-trigger`}>
        <span className="visually-hidden">{label}</span>
        <Select.Trigger
          id={`${id}-trigger`}
          className="filter-select-trigger"
          aria-label={label}
          aria-controls={`${id}-options`}
        >
          <span className="filter-select-value">
            <Select.Value />
          </span>
          <span className="filter-select-sizing" aria-hidden="true">
            {options.map((option) => (
              <span key={option.value}>{option.text}</span>
            ))}
          </span>
        </Select.Trigger>
      </label>
      <Select.Portal>
        <Select.Content
          id={`${id}-options`}
          className="filter-options"
          aria-label={label}
          position="popper"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          onKeyDownCapture={(event) => {
            if (event.key === 'Tab') {
              event.stopPropagation();
              flushSync(() => onOpenChange(false));
              document.getElementById(`${id}-trigger`)?.focus();
            }
          }}
          onCloseAutoFocus={(event) => {
            if (document.activeElement !== document.body)
              event.preventDefault();
          }}
        >
          <Select.Viewport className="filter-options-viewport">
            {options.map((option, index) => (
              <Select.Item
                id={`${id}-trigger-option-${index}`}
                key={option.value}
                value={JSON.stringify(option.value)}
                textValue={option.text}
                className="filter-option"
              >
                <Select.ItemText>{option.text}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
