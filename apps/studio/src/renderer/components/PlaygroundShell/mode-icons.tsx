interface ModeIconProps {
  className?: string;
}

export function RecorderModeIcon({ className }: ModeIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 16 16"
    >
      <path
        d="M11.334 3.6665H2.00065C1.63246 3.6665 1.33398 3.96498 1.33398 4.33317V11.6665C1.33398 12.0347 1.63246 12.3332 2.00065 12.3332H11.334C11.7022 12.3332 12.0007 12.0347 12.0007 11.6665V4.33317C12.0007 3.96498 11.7022 3.6665 11.334 3.6665Z"
        stroke="currentColor"
        strokeWidth="1.28571"
      />
      <path
        d="M12 9.66667L14.6667 11V5L12 6.33333"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.28571"
      />
    </svg>
  );
}

export function ReplayModeIcon({ className }: ModeIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 16 16"
    >
      <g transform="translate(1.4 1.4)">
        <path
          d="M2.35737 10.8426C3.44314 11.9284 4.94314 12.6 6.60001 12.6C9.91371 12.6 12.6 9.9137 12.6 6.6C12.6 3.2863 9.91371 0.6 6.60001 0.6C4.94314 0.6 3.44314 1.27157 2.35737 2.35737C1.80471 2.91003 0.600007 4.26667 0.600007 4.26667"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.2"
        />
      </g>
      <g transform="translate(1.4 2.4)">
        <path
          d="M0.6 0.6V3.26667H3.26667"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.2"
        />
      </g>
      <g transform="translate(6.4 5.4)">
        <path
          d="M0.6 2.6V0.6L2.26667 1.6L3.93333 2.6L2.26667 3.6L0.6 4.6V2.6Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.2"
        />
      </g>
    </svg>
  );
}

export function ApiPlaygroundModeIcon({ className }: ModeIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 16 16"
    >
      <path
        d="M13.8327 1.33514H2.16632C1.70609 1.33514 1.33301 1.79422 1.33301 2.36053V14.0711C1.33301 14.6651 1.80614 14.8803 2.16632 14.5388L3.98804 12.6274H13.8327C14.2929 12.6274 14.666 12.2435 14.666 11.6772V2.36053C14.666 1.79422 14.2929 1.33514 13.8327 1.33514Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}
