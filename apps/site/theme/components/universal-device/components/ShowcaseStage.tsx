import {
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type ArmStageController,
  mountArmWorkbenchStage,
} from '../engine/arm-workbench-stage';
import { IOSScreenEngine } from '../engine/ios-screen';
import { useI18n } from '../i18n/translations';
import { type HidBar, MacBookSvg, type TermLine } from './MacBookSvg';

type StageTab = 'arm' | 'ble' | 'soon';

interface TaskAction {
  type: 'tap' | 'swipe';
  label: string;
  targetId?: string;
  nx?: number;
  ny?: number;
  nx2?: number;
  ny2?: number;
  scrollTo?: number;
  ensurePage?: 'home' | 'settings' | 'general';
}

const STEP_ACTIONS: TaskAction[] = [
  {
    type: 'tap',
    label: 'Settings',
    targetId: 'settings',
    ensurePage: 'home',
  },
  {
    type: 'swipe',
    label: 'Scroll to General',
    nx: 0.5,
    ny: 0.72,
    nx2: 0.5,
    ny2: 0.34,
    scrollTo: 0.14,
    ensurePage: 'settings',
  },
  {
    type: 'tap',
    label: 'General',
    targetId: 'general',
    ensurePage: 'settings',
  },
  {
    type: 'tap',
    label: 'About',
    nx: 0.5,
    ny: 0.165,
    ensurePage: 'general',
  },
  {
    type: 'tap',
    label: 'Assert iOS 18.2',
    nx: 0.75,
    ny: 0.22,
    ensurePage: 'general',
  },
];

const INITIAL_LINES: TermLine[] = [
  { text: '$ midscene run --device iphone-hid', color: '#f5f5f7' },
  { text: '✓ paired     iPhone 16 Pro · Bluetooth HID', color: '#7dc47f' },
  { text: '✓ mirror     1179×2556 @ 60fps', color: '#7dc47f' },
  { text: '· waiting for task…', color: '#6b6b70' },
];

const INITIAL_BARS: HidBar[] = Array.from({ length: 14 }, () => ({
  height: 3 + Math.round(Math.random() * 5),
  fill: '#3a3a42',
}));

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(id);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

export function ShowcaseStage() {
  const { locale, t } = useI18n();
  const [activeTab, setActiveTab] = useState<StageTab>('arm');
  const [autoPlay, setAutoPlay] = useState(true);
  const [activeStep, setActiveStep] = useState<number>(-1);
  const [doneSteps, setDoneSteps] = useState<Set<number>>(() => new Set());
  const [bleSending, setBleSending] = useState(false);
  const [termLines, setTermLines] = useState<TermLine[]>(INITIAL_LINES);
  const [hidBars, setHidBars] = useState<HidBar[]>(INITIAL_BARS);
  const [latencyMs, setLatencyMs] = useState(11);
  const [pktLabel, setPktLabel] = useState('0x05 0x01 · idle');

  const stageElRef = useRef<HTMLDivElement | null>(null);
  const armCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pipCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const armCtrlRef = useRef<ArmStageController | null>(null);
  const runAbortRef = useRef<AbortController | null>(null);
  const bleSendingRef = useRef(false);

  const iosScreen = useMemo(() => new IOSScreenEngine(locale), [locale]);

  const pushTermLine = useCallback((text: string, color: string) => {
    setTermLines((prev) => [...prev, { text, color }].slice(-10));
  }, []);

  useEffect(() => {
    bleSendingRef.current = bleSending;
  }, [bleSending]);

  // Sync 2D canvas mirrors whenever IOSScreenEngine redraws
  useEffect(() => {
    const syncCanvases = (src: HTMLCanvasElement) => {
      for (const target of [pipCanvasRef.current, bleCanvasRef.current]) {
        if (!target) continue;
        const ctx = target.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, target.width, target.height);
          ctx.drawImage(src, 0, 0, target.width, target.height);
        }
      }
      armCtrlRef.current?.syncScreenTexture();
    };

    iosScreen.onChange = syncCanvases;
    syncCanvases(iosScreen.canvas);
    return () => {
      iosScreen.onChange = null;
    };
  }, [iosScreen]);

  // Mount 3D DOBOT MG400 workbench
  useEffect(() => {
    const stageEl = stageElRef.current;
    const canvas = armCanvasRef.current;
    if (!stageEl || !canvas) return;

    const ac = new AbortController();
    let mountedCtrl: ArmStageController | null = null;

    mountArmWorkbenchStage(stageEl, canvas, iosScreen, ac.signal)
      .then((ctrl) => {
        if (ac.signal.aborted) {
          ctrl.dispose();
          return;
        }
        mountedCtrl = ctrl;
        armCtrlRef.current = ctrl;
        ctrl.setActive(activeTab === 'arm');
      })
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') {
          console.error('Failed to mount 3D workbench:', err);
        }
      });

    return () => {
      ac.abort();
      if (mountedCtrl) {
        mountedCtrl.dispose();
        armCtrlRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iosScreen]);

  useEffect(() => {
    armCtrlRef.current?.setActive(activeTab === 'arm');
  }, [activeTab]);

  // Animate HID report bars on Tab 02
  useEffect(() => {
    if (activeTab !== 'ble') return;
    const id = window.setInterval(() => {
      const sending = bleSendingRef.current;
      setHidBars((prev) => [
        ...prev.slice(1),
        {
          height: sending
            ? 10 + Math.round(Math.random() * 28)
            : 2 + Math.round(Math.random() * 4),
          fill: sending ? '#f4f4f5' : '#3a3a42',
        },
      ]);
    }, 90);
    return () => window.clearInterval(id);
  }, [activeTab]);

  const executeAction = useCallback(
    async (action: TaskAction, stepIndex: number, signal: AbortSignal) => {
      setActiveStep(stepIndex);

      if (action.ensurePage && iosScreen.page !== action.ensurePage) {
        iosScreen.page = action.ensurePage;
        iosScreen.scrollY =
          action.ensurePage === 'settings' && stepIndex >= 2 ? 0.14 : 0;
        iosScreen.render();
      }

      const coords = action.targetId
        ? iosScreen.getTargetCenter(action.targetId)
        : { nx: action.nx ?? 0.5, ny: action.ny ?? 0.5 };
      const nx = coords.nx;
      const ny = coords.ny;
      const nx2 = action.nx2 ?? nx;
      const ny2 = action.ny2 ?? ny;

      setBleSending(true);
      const verb = action.type === 'swipe' ? 'aiScroll' : 'aiTap';
      pushTermLine(`› ${verb}("${action.label}")`, '#f5f5f7');
      if (action.type === 'swipe') {
        pushTermLine(
          `  hid.pointer  drag (${nx.toFixed(2)}, ${ny.toFixed(2)}) → (${nx2.toFixed(2)}, ${ny2.toFixed(2)})`,
          '#a1a1a1',
        );
        setPktLabel('0x05 0x0D · drag');
      } else {
        pushTermLine(
          `  hid.pointer  move → (${nx.toFixed(2)}, ${ny.toFixed(2)})`,
          '#a1a1a1',
        );
        setPktLabel('0x05 0x01 · click');
      }

      // Phase 1: Locate + hover
      iosScreen.setOverlay({
        mode: 'locate',
        nx,
        ny,
        progress: 0,
        label: action.label,
      });
      const p1Start = performance.now();
      while (performance.now() - p1Start < 420) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const p = Math.min(1, (performance.now() - p1Start) / 420);
        armCtrlRef.current?.setCommandState({
          phase: 1,
          type: action.type,
          nx,
          ny,
          nx2,
          ny2,
          progress: p,
        });
        await sleep(16, signal);
      }

      // Phase 2: Tap / Swipe
      const p2Dur = action.type === 'swipe' ? 680 : 520;
      const p2Start = performance.now();
      while (performance.now() - p2Start < p2Dur) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const p = Math.min(1, (performance.now() - p2Start) / p2Dur);
        iosScreen.setOverlay({
          mode: action.type,
          nx,
          ny,
          nx2,
          ny2,
          progress: p,
        });
        armCtrlRef.current?.setCommandState({
          phase: 2,
          type: action.type,
          nx,
          ny,
          nx2,
          ny2,
          progress: p,
        });
        if (action.type === 'swipe' && action.scrollTo !== undefined) {
          iosScreen.setScrollY(action.scrollTo * p);
        }
        await sleep(16, signal);
      }

      // Apply state change
      iosScreen.setOverlay(null);
      if (action.type === 'tap') {
        iosScreen.applyTap(nx, ny);
      } else if (action.scrollTo !== undefined) {
        iosScreen.setScrollY(action.scrollTo);
      }
      armCtrlRef.current?.setCommandState({
        phase: 0,
        type: 'tap',
        nx,
        ny,
        nx2,
        ny2,
        progress: 0,
      });

      setBleSending(false);
      const ms = 9 + Math.round(Math.random() * 6);
      setLatencyMs(ms);
      pushTermLine(
        `  ✓ ${action.type === 'swipe' ? 'scrolled' : 'clicked'}   ${ms} ms`,
        '#7dc47f',
      );
      setPktLabel('0x05 0x01 · idle');

      setDoneSteps((prev) => {
        const next = new Set(prev);
        next.add(stepIndex);
        return next;
      });
    },
    [iosScreen, pushTermLine],
  );

  // Auto-play loop
  useEffect(() => {
    if (!autoPlay || activeTab === 'soon') return;
    const ac = new AbortController();
    runAbortRef.current = ac;

    const loop = async () => {
      try {
        while (!ac.signal.aborted) {
          iosScreen.page = 'home';
          iosScreen.scrollY = 0;
          iosScreen.render();
          setDoneSteps(new Set());
          setActiveStep(-1);
          await sleep(600, ac.signal);

          for (let i = 0; i < STEP_ACTIONS.length; i += 1) {
            if (ac.signal.aborted) return;
            await executeAction(STEP_ACTIONS[i], i, ac.signal);
            await sleep(480, ac.signal);
          }
          await sleep(1200, ac.signal);
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error(err);
        }
      }
    };

    loop();
    return () => {
      ac.abort();
    };
  }, [activeTab, autoPlay, executeAction, iosScreen]);

  const handleStepClick = (idx: number) => {
    setAutoPlay(false);
    runAbortRef.current?.abort();
    const ac = new AbortController();
    runAbortRef.current = ac;
    executeAction(STEP_ACTIONS[idx], idx, ac.signal).catch(() => {});
  };

  const handleMirrorClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    setAutoPlay(false);
    runAbortRef.current?.abort();
    const ac = new AbortController();
    runAbortRef.current = ac;
    executeAction(
      {
        type: 'tap',
        label: `tap (${Math.round(nx * 390)}, ${Math.round(ny * 844)})`,
        nx,
        ny,
      },
      0,
      ac.signal,
    ).catch(() => {});
  };

  return (
    <section id="stage" aria-labelledby="showcase">
      <div className="instrument">
        <div className="instrument-bar">
          <div className="tab-group" role="tablist">
            <button
              className={`tab-btn${activeTab === 'arm' ? ' active' : ''}`}
              type="button"
              role="tab"
              aria-selected={activeTab === 'arm'}
              onClick={() => setActiveTab('arm')}
            >
              <span>{t.stage.tabArm}</span>
            </button>
            <button
              className={`tab-btn${activeTab === 'ble' ? ' active' : ''}`}
              type="button"
              role="tab"
              aria-selected={activeTab === 'ble'}
              onClick={() => setActiveTab('ble')}
            >
              <span>{t.stage.tabBle}</span>
            </button>
            <button
              className={`tab-btn${activeTab === 'soon' ? ' active' : ''}`}
              type="button"
              role="tab"
              aria-selected={activeTab === 'soon'}
              onClick={() => setActiveTab('soon')}
            >
              <span>{t.stage.tabSoon}</span>
            </button>
          </div>
        </div>

        <div
          className={`instrument-body${activeTab === 'soon' ? ' is-soon' : ''}`}
        >
          <div className="viewport-col">
            {/* Tab 01: 3D DOBOT MG400 */}
            <div
              ref={stageElRef}
              className="viewport-stage"
              hidden={activeTab !== 'arm'}
            >
              <canvas ref={armCanvasRef} className="arm-canvas" />
              <div className="stage-fallback" aria-label="Loading 3D model">
                <span className="stage-spinner" />
              </div>

              <div className="pip-phone-wrap">
                <div className="phone-frame phone-frame-sm">
                  <canvas
                    ref={pipCanvasRef}
                    className="mirror-canvas"
                    width={780}
                    height={1688}
                    onClick={handleMirrorClick}
                  />
                </div>
              </div>
            </div>

            {/* Tab 02: MacBook Pro -> Bluetooth HID -> iPhone */}
            <div
              className="viewport-stage ble-2d-stage"
              hidden={activeTab !== 'ble'}
            >
              <div className="ble-desk">
                <MacBookSvg
                  sending={bleSending}
                  lines={termLines}
                  bars={hidBars}
                  latencyMs={latencyMs}
                  pktLabel={pktLabel}
                />

                <div
                  className={`ble-link${bleSending ? ' is-sending' : ''}`}
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 120 40" className="ble-link-svg">
                    <title>Bluetooth HID link</title>
                    <line
                      x1="2"
                      y1="20"
                      x2="118"
                      y2="20"
                      className="ble-track"
                    />
                    <line
                      x1="2"
                      y1="20"
                      x2="118"
                      y2="20"
                      className="ble-flow"
                    />
                    <circle className="ble-pkt" r="2.2" cy="20" cx="2" />
                    <rect
                      x="49"
                      y="9"
                      width="22"
                      height="22"
                      rx="4"
                      className="ble-chip"
                    />
                    <path
                      transform="translate(53.5 13.5) scale(0.54)"
                      d="m7 7 10 10-5 5V2l5 5L7 17"
                      className="ble-glyph-path"
                    />
                  </svg>
                  <span className="ble-cap mono">Bluetooth HID</span>
                </div>

                <div className="phone-frame phone-frame-md">
                  <canvas
                    ref={bleCanvasRef}
                    className="mirror-canvas"
                    width={780}
                    height={1688}
                    onClick={handleMirrorClick}
                  />
                </div>
              </div>
            </div>

            {/* Tab 03: More showcases */}
            <div
              className="viewport-stage soon-stage"
              hidden={activeTab !== 'soon'}
            >
              <div className="soon-card">
                <p>{t.stage.soonDesc}</p>
                <a
                  className="btn btn-primary btn-sm"
                  href="https://github.com/web-infra-dev/midscene-robotics/issues/new"
                >
                  {t.stage.soonCta}
                </a>
              </div>
            </div>
          </div>

          {/* Right: Tasks Stepper */}
          <aside className="task-col">
            <div className="panel-head">
              <p className="eyebrow">
                <i />
                {t.stage.panelTitle}
              </p>
              <button
                className={`auto-btn${autoPlay ? ' active' : ''}`}
                type="button"
                onClick={() => setAutoPlay((v) => !v)}
              >
                <span className="dot" />
                {t.stage.autoPlay}
              </button>
            </div>

            <div className="prompt-box mono">
              <span className="prompt-caret">›</span>
              <span className="prompt-text" title={t.stage.promptText}>
                {t.stage.promptText}
              </span>
            </div>

            <div className="stepper">
              {t.stage.steps.map((step, idx) => {
                const isRunning = activeStep === idx;
                const isDone = !isRunning && doneSteps.has(idx);
                return (
                  <button
                    key={step.label}
                    className={`step-row${isRunning ? ' is-running' : ''}${isDone ? ' is-done' : ''}`}
                    type="button"
                    onClick={() => handleStepClick(idx)}
                  >
                    <span className="step-dot" />
                    <span className="step-label">{step.label}</span>
                    <span className="step-meta mono">{step.meta}</span>
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
