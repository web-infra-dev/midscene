import { useState } from 'react';
import { assetUrls } from '../../assets';
import { MaskedIcon } from '../MaskedIcon';

interface ModelConfigCardProps {
  /** Whether MIDSCENE_MODEL_* env values are complete enough to run. */
  complete: boolean;
  /** Raw env text, used to preview a few lines in the expanded body. */
  envText?: string;
  /** Click handler — opens the env config modal. */
  onOpen?: () => void;
}

const CARD_BG_GRADIENT =
  'radial-gradient(circle at 97% 0%, rgba(26,121,255,0.04) 0%, rgba(26,121,255,0) 97%), ' +
  'radial-gradient(circle at 73% 0%, rgba(153,95,245,0.04) 0%, rgba(153,95,245,0) 100%), ' +
  'radial-gradient(circle at 60% 0%, rgba(255,142,0,0.04) 0%, rgba(255,142,0,0) 100%)';

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <circle cx="8" cy="8" fill="#12B981" r="8" />
      <path
        d="M4.8 8.2L7 10.3l4.2-4.4"
        stroke="#fff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <circle cx="8" cy="8" fill="#E53935" r="8" />
      <path
        d="M8 4.5v4.2"
        stroke="#fff"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
      <circle cx="8" cy="11.2" fill="#fff" r="0.9" />
    </svg>
  );
}

function ChevronDown({ flipped }: { flipped: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`shrink-0 transition-transform ${flipped ? 'rotate-180' : ''}`}
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <path
        d="M4 6L8 10L12 6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
    </svg>
  );
}

const ENV_PLACEHOLDER =
  'MIDSCENE_MODEL_BASE_URL=...\nMIDSCENE_MODEL_API_KEY=...\nMIDSCENE_MODEL_NAME=...\nMIDSCENE_MODEL_FAMILY=...';

function EnvTextPreview({ text }: { text: string }) {
  // Mirror the env modal's Text tab exactly: show the raw text the user
  // entered (or the same placeholder the modal uses when nothing is set).
  // Both surfaces edit the same config, so the previews must stay in sync.
  const trimmed = text.trim();
  const isPlaceholder = trimmed.length === 0;
  return (
    <pre
      className={`m-0 whitespace-pre-wrap font-sans text-[12px] leading-[20px] ${
        isPlaceholder ? 'text-text-placeholder' : 'text-text-primary'
      }`}
    >
      {isPlaceholder ? ENV_PLACEHOLDER : text}
    </pre>
  );
}

export function ModelConfigCard({
  complete,
  envText,
  onOpen,
}: ModelConfigCardProps) {
  // Default to expanded when env is missing — the user needs to see the
  // template right away. Once the config is complete, default to collapsed
  // so the overview stays compact.
  const [expanded, setExpanded] = useState(!complete);

  return (
    <div
      className="w-[720px] shrink-0 overflow-hidden rounded-[12px] bg-surface-muted"
      style={{ backgroundImage: CARD_BG_GRADIENT }}
    >
      <button
        className="flex h-[48px] w-full cursor-pointer appearance-none items-center justify-between border-0 bg-transparent px-[16px] text-left"
        onClick={() => setExpanded((prev) => !prev)}
        type="button"
      >
        <span className="flex items-center gap-[8px]">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-active">
            <MaskedIcon
              className="h-[14px] w-[14px] text-text-primary"
              src={assetUrls.main.env}
            />
          </span>
          <span className="text-[14px] font-medium leading-[16px] text-text-primary">
            Model Config
          </span>
          {complete ? <CheckIcon /> : <WarningIcon />}
        </span>
        <span className="flex items-center gap-[8px] text-text-secondary">
          <ChevronDown flipped={expanded} />
        </span>
      </button>
      {expanded ? (
        <div className="border-t border-border-subtle px-[16px] py-[16px]">
          <EnvTextPreview text={envText ?? ''} />
          {onOpen ? (
            <button
              className="mt-[12px] inline-flex h-[28px] cursor-pointer appearance-none items-center rounded-[8px] border border-border-subtle bg-surface px-[10px] text-[12px] font-medium text-text-primary hover:bg-surface-hover"
              onClick={(event) => {
                event.stopPropagation();
                onOpen();
              }}
              type="button"
            >
              {complete ? 'Edit env' : 'Configure'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
