import { type ReactNode, useEffect, useId } from 'react';

export const performanceHelp = (
  <>
    <span>
      Performance is the estimated time in seconds from receiving the grounding
      prompt to returning a result. Lower is faster. The estimate uses output
      token counts and provider performance data (typically P50) to reduce the
      influence of network latency, Midscene adapter overhead, Node.js
      scheduling, and provider safety checks.
    </span>
    <span className="model-metric-help-formula">
      Performance = min(Measured Duration, calls × TTFT + output tokens ÷
      throughput)
    </span>
    <span>
      For each testcase, use the final attempt if it returned a prediction or
      refusal. TTFT (time to first token) and measured duration are in seconds.
      Throughput is in output tokens per second. Use measured duration when
      token usage is incomplete or a formula input is unavailable.
    </span>
  </>
);

function positionHelp(tooltip: HTMLElement, bounds: DOMRect) {
  const { width, height } = tooltip.getBoundingClientRect();
  tooltip.style.left = `${Math.max(16, Math.min(bounds.right - width, window.innerWidth - width - 16))}px`;
  tooltip.style.top = `${bounds.bottom + height + 8 <= window.innerHeight - 16 ? bounds.bottom + 8 : Math.max(16, bounds.top - height - 8)}px`;
}

export function useHelpPopoverPosition() {
  useEffect(() => {
    function update() {
      const tooltip = document.querySelector<HTMLElement>(
        '.model-metric-help-tooltip:popover-open',
      );
      if (!tooltip) return;
      const button = tooltip.previousElementSibling;
      if (
        button &&
        (button === document.activeElement || button.matches(':hover'))
      ) {
        const bounds = button.getBoundingClientRect();
        if (
          button.contains(
            document.elementFromPoint(
              bounds.x + bounds.width / 2,
              bounds.y + bounds.height / 2,
            ),
          )
        ) {
          positionHelp(tooltip, bounds);
          return;
        }
      }
      tooltip.hidePopover();
    }
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, []);
}

function HelpPopover({
  label,
  icon,
  children,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  function show(button: HTMLButtonElement) {
    const tooltip = button.nextElementSibling as HTMLElement | null;
    if (!tooltip?.showPopover) return;
    tooltip.showPopover();
    positionHelp(tooltip, button.getBoundingClientRect());
  }
  return (
    <span
      className="model-metric-help"
      onPointerLeave={(event) => {
        if (!event.currentTarget.contains(document.activeElement))
          event.currentTarget
            .querySelector<HTMLElement>('[popover]')
            ?.hidePopover?.();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          event.currentTarget
            .querySelector<HTMLElement>('[popover]')
            ?.hidePopover?.();
      }}
    >
      <button
        type="button"
        className="model-metric-help-trigger"
        aria-label={label}
        aria-describedby={id}
        onPointerEnter={(event) => show(event.currentTarget)}
        onFocus={(event) => show(event.currentTarget)}
        onClick={(event) => show(event.currentTarget)}
      >
        {icon}
      </button>
      <span
        className="model-metric-help-tooltip"
        role="tooltip"
        id={id}
        ref={(element) => element?.setAttribute('popover', 'auto')}
      >
        {children}
      </span>
    </span>
  );
}

export function MetricHelp({
  label,
  text,
  includeAverageNote = true,
}: { label: string; text: ReactNode; includeAverageNote?: boolean }) {
  return (
    <HelpPopover
      label={`How ${label} Is Calculated`}
      icon={
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4" />
          <circle cx="12" cy="16.5" r=".8" fill="currentColor" stroke="none" />
        </svg>
      }
    >
      <strong>{label}</strong>
      {typeof text === 'string' ? (
        <span className="model-metric-help-formula">{text}</span>
      ) : (
        text
      )}
      {includeAverageNote && (
        <span>
          Arithmetic means include valid samples, including zero. Missing values
          are excluded. Coverage is shown in the table.
        </span>
      )}
    </HelpPopover>
  );
}

export function ModelSnapshots({ ids }: { ids?: string[] }) {
  if (!ids?.length) return 'N/A';
  if (ids.length === 1) return ids[0];
  return (
    <>
      {ids[0]}
      <HelpPopover
        label="Show observed snapshot IDs"
        icon={
          <span className="snapshot-warning" aria-hidden="true">
            !
          </span>
        }
      >
        <strong>Multiple snapshot IDs observed</strong>
        {ids.map((id) => (
          <span key={id}>{id}</span>
        ))}
      </HelpPopover>
    </>
  );
}
