export interface TermLine {
  text: string;
  color: string;
  op?: number;
}

export interface HidBar {
  height: number;
  fill: string;
}

interface MacBookSvgProps {
  sending: boolean;
  lines: TermLine[];
  bars: HidBar[];
  latencyMs: number;
  pktLabel: string;
}

const APPS = [
  'finder',
  'safari',
  'terminal',
  'midscene',
  'mail',
  'notes',
  'messages',
  'music',
  'settings',
] as const;

type AppKind = (typeof APPS)[number];

const APP_BG: Record<AppKind, string> = {
  finder: '#1f6fe0',
  safari: '#1f6fe0',
  terminal: '#1c1c1e',
  midscene: '#0d0d0f',
  mail: '#3b82f6',
  notes: '#fff6d5',
  messages: '#30d158',
  music: '#fc3c44',
  settings: '#8e8e93',
};

function DockIcon({
  kind,
  x,
  y,
  s,
}: {
  kind: AppKind;
  x: number;
  y: number;
  s: number;
}) {
  const r = s * 0.24;
  const c = x + s / 2;
  const m = y + s / 2;
  const bg = APP_BG[kind];

  return (
    <g>
      <rect x={x} y={y} width={s} height={s} rx={r} fill={bg} />
      {kind === 'finder' && (
        <>
          <rect
            x={x + s / 2}
            y={y}
            width={s / 2}
            height={s}
            rx={r}
            fill="#5aa9f6"
          />
          <rect x={x + s / 2} y={y} width={s * 0.2} height={s} fill="#5aa9f6" />
          <circle
            cx={c - s * 0.16}
            cy={m - s * 0.1}
            r={s * 0.05}
            fill="#1c1c1e"
          />
          <circle
            cx={c + s * 0.16}
            cy={m - s * 0.1}
            r={s * 0.05}
            fill="#1c1c1e"
          />
        </>
      )}
      {kind === 'safari' && (
        <>
          <circle
            cx={c}
            cy={m}
            r={s * 0.32}
            fill="none"
            stroke="#fff"
            strokeWidth={s * 0.06}
          />
          <path
            d={`M${c + s * 0.16} ${m - s * 0.16}L${c - s * 0.05} ${m + s * 0.05}L${c + s * 0.05} ${m - s * 0.05}z`}
            fill="#ff3b30"
          />
          <path
            d={`M${c - s * 0.16} ${m + s * 0.16}L${c - s * 0.05} ${m + s * 0.05}L${c + s * 0.05} ${m - s * 0.05}z`}
            fill="#fff"
          />
        </>
      )}
      {kind === 'terminal' && (
        <text
          x={x + s * 0.16}
          y={y + s * 0.66}
          fontFamily="JetBrains Mono, monospace"
          fontSize={s * 0.42}
          fontWeight={700}
          fill="#7dc47f"
        >
          &gt;_
        </text>
      )}
      {kind === 'midscene' && (
        <>
          <circle
            cx={c}
            cy={m}
            r={s * 0.26}
            fill="none"
            stroke="#fff"
            strokeWidth={s * 0.07}
          />
          <circle cx={c} cy={m} r={s * 0.08} fill="#f4f4f5" />
        </>
      )}
      {kind === 'mail' && (
        <>
          <rect
            x={c - s * 0.3}
            y={m - s * 0.2}
            width={s * 0.6}
            height={s * 0.4}
            rx={s * 0.05}
            fill="#fff"
          />
          <path
            d={`M${c - s * 0.3} ${m - s * 0.18}l${s * 0.3} ${s * 0.2}l${s * 0.3} ${-s * 0.2}`}
            fill="none"
            stroke={bg}
            strokeWidth={s * 0.05}
          />
        </>
      )}
      {kind === 'notes' && (
        <>
          <rect x={x} y={y} width={s} height={s * 0.24} rx={r} fill="#e8c14a" />
          <rect
            x={x}
            y={y + s * 0.14}
            width={s}
            height={s * 0.1}
            fill="#e8c14a"
          />
          {[0, 1, 2].map((i) => (
            <line
              key={i}
              x1={c - s * 0.24}
              x2={c + s * 0.24}
              y1={m + s * 0.04 + i * s * 0.12}
              y2={m + s * 0.04 + i * s * 0.12}
              stroke="#a8a8ad"
              strokeWidth={s * 0.04}
            />
          ))}
        </>
      )}
      {kind === 'messages' && (
        <>
          <ellipse
            cx={c}
            cy={m - s * 0.02}
            rx={s * 0.3}
            ry={s * 0.24}
            fill="#fff"
          />
          <path
            d={`M${c - s * 0.2} ${m + s * 0.12}l${-s * 0.06} ${s * 0.14}l${s * 0.18} ${-s * 0.08}z`}
            fill="#fff"
          />
        </>
      )}
      {kind === 'music' && (
        <>
          <circle cx={c - s * 0.1} cy={m + s * 0.14} r={s * 0.1} fill="#fff" />
          <rect
            x={c - s * 0.02}
            y={m - s * 0.26}
            width={s * 0.06}
            height={s * 0.4}
            fill="#fff"
          />
          <path
            d={`M${c + s * 0.04} ${m - s * 0.26}q${s * 0.22} ${s * 0.04} ${s * 0.14} ${s * 0.2}`}
            fill="none"
            stroke="#fff"
            strokeWidth={s * 0.06}
          />
        </>
      )}
      {kind === 'settings' && (
        <>
          <circle
            cx={c}
            cy={m}
            r={s * 0.27}
            fill="none"
            stroke="#fff"
            strokeWidth={s * 0.13}
            strokeDasharray={`${s * 0.11} ${s * 0.07}`}
          />
          <circle
            cx={c}
            cy={m}
            r={s * 0.12}
            fill={bg}
            stroke="#fff"
            strokeWidth={s * 0.05}
          />
        </>
      )}
    </g>
  );
}

export function MacBookSvg({
  sending,
  lines,
  bars,
  latencyMs,
  pktLabel,
}: MacBookSvgProps) {
  const s = 14;
  const gap = 3.6;
  const totalW = APPS.length * s + (APPS.length - 1) * gap;
  const x0 = 200 - totalW / 2;
  const barBase = 162;

  return (
    <figure className={`mac-unit${sending ? ' is-sending' : ''}`}>
      <svg
        className="mac-svg"
        viewBox="0 0 400 262"
        role="img"
        aria-label="MacBook Pro running Midscene"
      >
        <defs>
          <linearGradient id="mb-lid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4a4a50" />
            <stop offset="1" stopColor="#26262a" />
          </linearGradient>
          <linearGradient id="mb-wall" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#1d2440" />
            <stop offset="0.5" stopColor="#151628" />
            <stop offset="1" stopColor="#0d0d12" />
          </linearGradient>
          <radialGradient id="mb-glow" cx="0.78" cy="0.2" r="0.6">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.14" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="mb-base" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5a5a60" />
            <stop offset="0.35" stopColor="#3a3a40" />
            <stop offset="1" stopColor="#18181b" />
          </linearGradient>
          <radialGradient id="mb-shadow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#000" stopOpacity="0.7" />
            <stop offset="1" stopColor="#000" stopOpacity="0" />
          </radialGradient>
          <clipPath id="mb-clip">
            <rect x="31" y="11" width="338" height="210" rx="3" />
          </clipPath>
        </defs>

        <ellipse cx="200" cy="252" rx="210" ry="9" fill="url(#mb-shadow)" />
        <rect
          x="19"
          y="0"
          width="362"
          height="232"
          rx="13"
          fill="url(#mb-lid)"
        />
        <rect
          x="20.5"
          y="1.5"
          width="359"
          height="229"
          rx="11.5"
          fill="#050506"
          stroke="#000"
          strokeWidth="1"
        />

        <g clipPath="url(#mb-clip)">
          <rect x="31" y="11" width="338" height="210" fill="url(#mb-wall)" />
          <rect x="31" y="11" width="338" height="210" fill="url(#mb-glow)" />

          <rect
            x="31"
            y="11"
            width="338"
            height="12"
            fill="#fff"
            opacity="0.08"
          />
          <path
            transform="translate(39 13.2) scale(0.32)"
            fill="#f5f5f7"
            d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
          />
          <text x="52" y="19.6" className="mb-menu" fontWeight="600">
            Midscene
          </text>
          <text x="88" y="19.6" className="mb-menu" opacity="0.85">
            File Edit View Window
          </text>
          <text
            x="363"
            y="19.6"
            className="mb-menu"
            textAnchor="end"
            opacity="0.9"
          >
            Wed 9:41
          </text>
          <g
            transform="translate(320 13.6)"
            fill="none"
            stroke="#f5f5f7"
            strokeWidth="0.9"
            opacity="0.85"
          >
            <rect x="0" y="0.6" width="10" height="5.2" rx="1.4" />
            <rect
              x="1.2"
              y="1.8"
              width="6.6"
              height="2.8"
              rx="0.6"
              fill="#f5f5f7"
              stroke="none"
            />
          </g>
          <path
            className="mb-bt"
            transform="translate(305 13.4) scale(0.29)"
            fill="none"
            stroke="#f5f5f7"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m7 7 10 10-5 5V2l5 5L7 17"
          />

          <path
            d="M178 11h44v6.5a3.5 3.5 0 0 1-3.5 3.5h-37a3.5 3.5 0 0 1-3.5-3.5z"
            fill="#050506"
          />

          <rect
            x="52"
            y="34"
            width="214"
            height="146"
            rx="6"
            fill="#000"
            opacity="0.35"
            transform="translate(1.5 3)"
          />
          <rect
            x="52"
            y="34"
            width="214"
            height="146"
            rx="6"
            fill="#121215"
            stroke="#3a3a42"
            strokeWidth="0.8"
          />
          <path
            d="M52 40a6 6 0 0 1 6-6h202a6 6 0 0 1 6 6v8H52z"
            fill="#1f1f24"
          />
          <circle cx="61" cy="41" r="2.4" fill="#ff5f57" />
          <circle cx="69" cy="41" r="2.4" fill="#febc2e" />
          <circle cx="77" cy="41" r="2.4" fill="#28c840" />
          <text x="159" y="43.2" className="mb-title" textAnchor="middle">
            midscene — iphone-hid — zsh
          </text>

          <g className="mb-term">
            {lines.map((ln, idx) => (
              <text
                key={`${idx}-${ln.text}`}
                x={60}
                y={60 + idx * 11.6}
                fill={ln.color}
                opacity={ln.op ?? 1}
              >
                {ln.text}
              </text>
            ))}
          </g>

          <rect
            x="274"
            y="34"
            width="86"
            height="146"
            rx="6"
            fill="#121215"
            stroke="#2c2c33"
            strokeWidth="0.8"
          />
          <text x="282" y="47" className="mb-cap">
            Bluetooth HID
          </text>
          <circle cx="352" cy="44.6" r="2" fill="#28c840" />
          <text x="282" y="61" className="mb-k">
            target
          </text>
          <text x="352" y="61" className="mb-v" textAnchor="end">
            iPhone 16 Pro
          </text>
          <text x="282" y="73" className="mb-k">
            profile
          </text>
          <text x="352" y="73" className="mb-v" textAnchor="end">
            Classic HID
          </text>
          <text x="282" y="85" className="mb-k">
            rssi
          </text>
          <text x="352" y="85" className="mb-v" textAnchor="end">
            −42 dBm
          </text>
          <text x="282" y="97" className="mb-k">
            latency
          </text>
          <text x="352" y="97" className="mb-v" textAnchor="end">
            {latencyMs} ms
          </text>
          <line
            x1="282"
            y1="105"
            x2="352"
            y2="105"
            stroke="#26262c"
            strokeWidth="0.8"
          />
          <text x="282" y="117" className="mb-cap">
            REPORTS
          </text>
          <g>
            {bars.map((b, i) => (
              <rect
                key={i}
                x={282 + i * 5}
                y={barBase - b.height}
                width={3}
                height={b.height}
                rx={0.6}
                fill={b.fill}
              />
            ))}
          </g>
          <text x="282" y="172" className="mb-k">
            {pktLabel}
          </text>

          <rect
            x="118"
            y="194"
            width="164"
            height="22"
            rx="6"
            fill="#fff"
            opacity="0.1"
          />
          <rect
            x="118"
            y="194"
            width="164"
            height="22"
            rx="6"
            fill="none"
            stroke="#fff"
            strokeOpacity="0.14"
            strokeWidth="0.6"
          />
          <g>
            {APPS.map((kind, i) => {
              const x = x0 + i * (s + gap);
              return (
                <g key={kind}>
                  <DockIcon kind={kind} x={x} y={198} s={s} />
                  {(kind === 'terminal' || kind === 'midscene') && (
                    <circle cx={x + s / 2} cy={214.6} r={0.8} fill="#f5f5f7" />
                  )}
                </g>
              );
            })}
          </g>
        </g>

        <path
          d="M0 232h400v4.5c0 3.6-2.4 6-7 7.4L380 247H20l-13-3.1C2.4 242.5 0 240.1 0 236.5z"
          fill="url(#mb-base)"
        />
        <rect
          x="0"
          y="232"
          width="400"
          height="1"
          fill="#8a8a90"
          opacity="0.6"
        />
        <path
          d="M172 232h56v1.6a2.4 2.4 0 0 1-2.4 2.4h-51.2a2.4 2.4 0 0 1-2.4-2.4z"
          fill="#1a1a1d"
        />
      </svg>
    </figure>
  );
}
