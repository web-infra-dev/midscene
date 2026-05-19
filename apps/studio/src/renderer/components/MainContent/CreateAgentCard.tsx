import { useState } from 'react';
import { assetUrls } from '../../assets';
import { MaskedIcon } from '../MaskedIcon';

export interface WebCreateInput {
  url: string;
  viewportWidth: number;
  viewportHeight: number;
  headed: boolean;
}

export interface IOSCreateInput {
  host: string;
  port: number;
}

interface BaseCardProps {
  title: string;
  iconColor?: string;
  busy?: boolean;
  submitLabel: string;
  busyLabel?: string;
  children: React.ReactNode;
  onSubmit: () => void;
}

const CARD_BG_GRADIENT =
  'radial-gradient(circle at 97% 0%, rgba(26,121,255,0.04) 0%, rgba(26,121,255,0) 97%), ' +
  'radial-gradient(circle at 73% 0%, rgba(153,95,245,0.04) 0%, rgba(153,95,245,0) 100%), ' +
  'radial-gradient(circle at 60% 0%, rgba(255,142,0,0.04) 0%, rgba(255,142,0,0) 100%)';

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

function SphereIcon() {
  return (
    <MaskedIcon
      className="h-[14px] w-[14px] text-text-primary"
      src={assetUrls.main.sphere}
    />
  );
}

function PhoneIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-[14px] w-[14px] text-text-primary"
      fill="none"
      viewBox="0 0 14 14"
    >
      <rect
        height="11.5"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="1.2"
        width="7.6"
        x="3.2"
        y="1.25"
      />
      <path d="M5.8 11.4h2.4" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function CardShell({
  busy,
  busyLabel,
  children,
  onSubmit,
  submitLabel,
  title,
}: BaseCardProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div
      className="w-[704px] shrink-0 overflow-hidden rounded-[12px] bg-surface-muted"
      style={{ backgroundImage: CARD_BG_GRADIENT }}
    >
      <button
        className="flex h-[48px] w-full cursor-pointer appearance-none items-center justify-between border-0 bg-transparent px-[16px] text-left"
        onClick={() => setExpanded((prev) => !prev)}
        type="button"
      >
        <span className="flex items-center gap-[8px]">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-active">
            {title === 'Open a web page' ? <SphereIcon /> : <PhoneIcon />}
          </span>
          <span className="text-[14px] font-medium leading-[16px] text-text-primary">
            {title}
          </span>
        </span>
        <span className="flex items-center text-text-secondary">
          <ChevronDown flipped={expanded} />
        </span>
      </button>
      {expanded ? (
        <div className="border-t border-border-subtle">
          <div className="px-[20px] py-[16px]">{children}</div>
          <div className="flex justify-end px-[20px] pb-[16px]">
            <button
              className="h-[32px] cursor-pointer appearance-none rounded-[8px] border border-brand bg-brand px-[16px] text-[14px] font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy}
              onClick={onSubmit}
              type="button"
            >
              {busy ? (busyLabel ?? 'Submitting…') : submitLabel}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="mb-[8px] text-[13px] font-medium leading-[20px] text-text-primary">
      {children}
      {required ? <span className="ml-[2px] text-[#E53935]">*</span> : null}
    </div>
  );
}

const inputBaseClass =
  'box-border h-[36px] w-full rounded-[8px] border border-border-subtle bg-surface px-[12px] text-[14px] leading-[17px] text-text-primary placeholder:text-text-placeholder focus:border-brand focus:outline-none';

function NumberInput({
  ariaLabel,
  onChange,
  prefix,
  value,
}: {
  ariaLabel: string;
  onChange: (next: number) => void;
  prefix: string;
  value: number;
}) {
  return (
    <div className="box-border flex h-[36px] min-w-0 flex-1 items-center rounded-[8px] border border-border-subtle bg-surface px-[12px]">
      <span className="mr-[8px] shrink-0 text-[14px] leading-[17px] text-text-placeholder">
        {prefix}
      </span>
      <input
        aria-label={ariaLabel}
        className="h-full w-0 min-w-0 flex-1 border-0 bg-transparent text-[14px] leading-[17px] text-text-primary placeholder:text-text-placeholder focus:outline-none"
        inputMode="numeric"
        min={1}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) {
            onChange(next);
          }
        }}
        type="number"
        value={value}
      />
    </div>
  );
}

export interface WebCreateAgentCardProps {
  busy?: boolean;
  defaultUrl?: string;
  defaultViewportWidth?: number;
  defaultViewportHeight?: number;
  defaultHeaded?: boolean;
  onSubmit: (input: WebCreateInput) => void | Promise<void>;
}

export function WebCreateAgentCard({
  busy,
  defaultHeaded = false,
  defaultUrl = 'https://example.com',
  defaultViewportHeight = 768,
  defaultViewportWidth = 1280,
  onSubmit,
}: WebCreateAgentCardProps) {
  const [url, setUrl] = useState(defaultUrl);
  const [width, setWidth] = useState(defaultViewportWidth);
  const [height, setHeight] = useState(defaultViewportHeight);
  const [headed, setHeaded] = useState(defaultHeaded);

  return (
    <CardShell
      busy={busy}
      busyLabel="Opening…"
      onSubmit={() => {
        if (busy) return;
        void onSubmit({
          url: url.trim() || defaultUrl,
          viewportWidth: width,
          viewportHeight: height,
          headed,
        });
      }}
      submitLabel="Open Page"
      title="Open a web page"
    >
      <div className="grid w-full grid-cols-3 gap-[8px]">
        <div className="flex min-w-0 flex-col">
          <FieldLabel required>URL</FieldLabel>
          <input
            aria-label="URL"
            className={inputBaseClass}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com"
            type="text"
            value={url}
          />
        </div>
        <div className="flex min-w-0 flex-col">
          <FieldLabel>Viewport</FieldLabel>
          <div className="grid w-full grid-cols-2 gap-[8px]">
            <NumberInput
              ariaLabel="Viewport width"
              onChange={setWidth}
              prefix="W"
              value={width}
            />
            <NumberInput
              ariaLabel="Viewport height"
              onChange={setHeight}
              prefix="H"
              value={height}
            />
          </div>
        </div>
        <div className="flex min-w-0 flex-col">
          <FieldLabel>Browser window</FieldLabel>
          <div className="relative h-[36px]">
            <select
              aria-label="Browser window mode"
              className={`${inputBaseClass} appearance-none pr-[32px]`}
              onChange={(event) => setHeaded(event.target.value === 'headed')}
              value={headed ? 'headed' : 'headless'}
            >
              <option value="headless">Headless</option>
              <option value="headed">Visible Chrome window</option>
            </select>
            <span className="pointer-events-none absolute right-[12px] top-1/2 -translate-y-1/2 text-text-secondary">
              <ChevronDown flipped={false} />
            </span>
          </div>
        </div>
      </div>
    </CardShell>
  );
}

export interface IOSCreateAgentCardProps {
  busy?: boolean;
  defaultHost?: string;
  defaultPort?: number;
  onSubmit: (input: IOSCreateInput) => void | Promise<void>;
}

export function IOSCreateAgentCard({
  busy,
  defaultHost = 'localhost',
  defaultPort = 8100,
  onSubmit,
}: IOSCreateAgentCardProps) {
  const [host, setHost] = useState(defaultHost);
  const [port, setPort] = useState(defaultPort);

  return (
    <CardShell
      busy={busy}
      busyLabel="Connecting…"
      onSubmit={() => {
        if (busy) return;
        void onSubmit({
          host: host.trim() || defaultHost,
          port,
        });
      }}
      submitLabel="Create Agent"
      title="Connect WebDriverAgent"
    >
      <div className="grid w-full grid-cols-3 gap-[8px]">
        <div className="col-span-2 flex min-w-0 flex-col">
          <FieldLabel required>WebDriverAgent host</FieldLabel>
          <input
            aria-label="WebDriverAgent host"
            className={inputBaseClass}
            onChange={(event) => setHost(event.target.value)}
            placeholder="localhost"
            type="text"
            value={host}
          />
        </div>
        <div className="col-span-1 flex min-w-0 flex-col">
          <FieldLabel required>Port</FieldLabel>
          <input
            aria-label="WebDriverAgent port"
            className={`${inputBaseClass} min-w-0`}
            inputMode="numeric"
            min={1}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) {
                setPort(next);
              }
            }}
            placeholder="8100"
            type="number"
            value={port}
          />
        </div>
      </div>
    </CardShell>
  );
}
