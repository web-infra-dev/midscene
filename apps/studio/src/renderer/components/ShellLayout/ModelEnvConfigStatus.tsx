type ModelEnvConfigStatusKind = 'success' | 'error';

interface ModelEnvConfigStatusProps {
  kind: ModelEnvConfigStatusKind;
}

function ErrorStatusIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 shrink-0"
      fill="none"
      viewBox="0 0 16 16"
    >
      <path
        d="M7.99967 14.6666C9.84061 14.6666 11.5073 13.9204 12.7137 12.714C13.9201 11.5076 14.6663 9.84091 14.6663 7.99998C14.6663 6.15905 13.9201 4.49238 12.7137 3.28593C11.5073 2.07951 9.84061 1.33331 7.99967 1.33331C6.15874 1.33331 4.49207 2.07951 3.28563 3.28593C2.0792 4.49238 1.33301 6.15905 1.33301 7.99998C1.33301 9.84091 2.0792 11.5076 3.28563 12.714C4.49207 13.9204 6.15874 14.6666 7.99967 14.6666Z"
        fill="#E13E37"
        stroke="#E13E37"
        strokeLinejoin="round"
        strokeWidth="1.33333"
      />
      <path
        clipRule="evenodd"
        d="M8.00033 12.3334C8.46056 12.3334 8.83366 11.9603 8.83366 11.5C8.83366 11.0398 8.46056 10.6667 8.00033 10.6667C7.54009 10.6667 7.16699 11.0398 7.16699 11.5C7.16699 11.9603 7.54009 12.3334 8.00033 12.3334Z"
        fill="white"
        fillRule="evenodd"
      />
      <path
        d="M8 4V9.33333"
        stroke="white"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.33333"
      />
    </svg>
  );
}

function SuccessStatusIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 shrink-0"
      fill="none"
      viewBox="0 0 16 16"
    >
      <path
        d="M7.99967 14.6666C9.84061 14.6666 11.5073 13.9204 12.7137 12.714C13.9201 11.5076 14.6663 9.84091 14.6663 7.99998C14.6663 6.15905 13.9201 4.49238 12.7137 3.28593C11.5073 2.07951 9.84061 1.33331 7.99967 1.33331C6.15874 1.33331 4.49207 2.07951 3.28563 3.28593C2.0792 4.49238 1.33301 6.15905 1.33301 7.99998C1.33301 9.84091 2.0792 11.5076 3.28563 12.714C4.49207 13.9204 6.15874 14.6666 7.99967 14.6666Z"
        fill="currentColor"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.33333"
      />
      <path
        d="M5.33301 8.16665L7.16634 9.99998L10.9997 6.33331"
        stroke="white"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.33333"
      />
    </svg>
  );
}

export function ModelEnvConfigStatus({ kind }: ModelEnvConfigStatusProps) {
  const isSuccess = kind === 'success';
  const statusClasses = isSuccess
    ? 'bg-status-success-bg text-status-success-fg'
    : 'bg-[#E13E37]/11 text-[#E13E37]';
  const message = isSuccess ? 'Test passed.' : 'Test failed. Please try again.';

  return (
    <div className="relative z-10 mt-[12px] px-[21px]">
      <div
        className={`box-border flex h-[32px] w-[360px] items-center justify-between rounded-[8px] px-[12px] py-[8px] ${statusClasses}`}
      >
        <div className="flex items-center gap-[10px]">
          {isSuccess ? <SuccessStatusIcon /> : <ErrorStatusIcon />}
          <span className="overflow-hidden whitespace-nowrap font-sans text-[12px] font-normal leading-[14.5px]">
            {message}
          </span>
        </div>
        <div aria-hidden="true" className="h-4 w-4 opacity-[0.01]" />
      </div>
    </div>
  );
}
