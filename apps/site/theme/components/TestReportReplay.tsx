import { Check, MousePointer2, Play, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import './TestReportReplay.css';

interface ActionFrame {
  id: string;
  type: 'Plan' | 'Locate' | 'Input' | 'Tap';
  time: string;
  at: string;
  inputValue: string;
  highlight: 'none' | 'input' | 'button';
  cursor: 'none' | 'input' | 'button';
  resultText: string;
}

export function TestReportReplay() {
  const t = useI18n();
  const [activeFrame, setActiveFrame] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveFrame((prev) => (prev + 1) % 4);
    }, 2000);
    return () => window.clearInterval(timer);
  }, []);

  const frames: ActionFrame[] = [
    {
      id: 'plan',
      type: 'Plan',
      time: '1.82s',
      at: '2s',
      inputValue: '',
      highlight: 'none',
      cursor: 'none',
      resultText: t('reportReplayIdle'),
    },
    {
      id: 'locate',
      type: 'Locate',
      time: '0.42s',
      at: '4s',
      inputValue: '',
      highlight: 'input',
      cursor: 'input',
      resultText: t('reportReplayIdle'),
    },
    {
      id: 'input',
      type: 'Input',
      time: '0.96s',
      at: '6s',
      inputValue: t('reportReplayQuery'),
      highlight: 'input',
      cursor: 'none',
      resultText: t('reportReplayIdle'),
    },
    {
      id: 'tap',
      type: 'Tap',
      time: '0.55s',
      at: '8s',
      inputValue: t('reportReplayQuery'),
      highlight: 'button',
      cursor: 'button',
      resultText: t('reportReplayFiltered'),
    },
  ];

  const current = frames[activeFrame];

  return (
    <div className="report-replay">
      {/* Top chrome bar matching Midscene report header */}
      <div className="report-replay__topbar">
        <div className="report-replay__crumbs">
          <span className="report-replay__brand">Midscene.js</span>
          <span className="report-replay__sep">/</span>
          <span className="report-replay__muted">Overview</span>
          <span className="report-replay__sep">/</span>
          <span className="report-replay__status">
            <Check size={11} strokeWidth={2.5} />
            Passed
          </span>
          <span className="report-replay__case">{t('reportReplayCase')}</span>
        </div>
        <div className="report-replay__meta">
          <span>10.6s</span>
          <span>28.5K tokens</span>
          <span className="report-replay__mode">
            <span data-active="true">Visual</span>
            <span>YAML</span>
          </span>
        </div>
      </div>

      {/* 3-pane report body */}
      <div className="report-replay__body">
        {/* Left pane: Lifecycle Steps */}
        <aside className="report-replay__steps" aria-label="Steps">
          <div className="report-replay__pane-title">Steps</div>

          <div className="report-replay__group">SETUP · 2</div>
          <div className="report-replay__step-row">
            <span className="report-replay__step-idx">1</span>
            <Check size={12} strokeWidth={2.4} className="report-replay__ok" />
            <span className="report-replay__step-name">gotoUrl</span>
            <span className="report-replay__step-time">120ms</span>
          </div>
          <div className="report-replay__step-row">
            <span className="report-replay__step-idx">2</span>
            <Check size={12} strokeWidth={2.4} className="report-replay__ok" />
            <span className="report-replay__step-name">prepareCatalog</span>
            <span className="report-replay__step-time">18ms</span>
          </div>

          <div className="report-replay__group">STEPS · 3</div>
          <div className="report-replay__step-row" data-active="true">
            <span className="report-replay__step-idx">3</span>
            <Check size={12} strokeWidth={2.4} className="report-replay__ok" />
            <span className="report-replay__step-name">
              <strong>aiAct</strong> {t('reportReplayActShort')}
            </span>
            <span className="report-replay__step-time">3.8s</span>
          </div>
          <div className="report-replay__step-row">
            <span className="report-replay__step-idx">4</span>
            <Check size={12} strokeWidth={2.4} className="report-replay__ok" />
            <span className="report-replay__step-name">
              <strong>aiWaitFor</strong> {t('reportReplayWaitShort')}
            </span>
            <span className="report-replay__step-time">1.4s</span>
          </div>
          <div className="report-replay__step-row">
            <span className="report-replay__step-idx">5</span>
            <Check size={12} strokeWidth={2.4} className="report-replay__ok" />
            <span className="report-replay__step-name">
              <strong>aiAssert</strong> {t('reportReplayAssertShort')}
            </span>
            <span className="report-replay__step-time">2.1s</span>
          </div>

          <div className="report-replay__group">TEARDOWN · 1</div>
          <div className="report-replay__step-row">
            <span className="report-replay__step-idx">6</span>
            <Check size={12} strokeWidth={2.4} className="report-replay__ok" />
            <span className="report-replay__step-name">clearCookies</span>
            <span className="report-replay__step-time">4ms</span>
          </div>
        </aside>

        {/* Middle pane: Execution breakdown */}
        <div className="report-replay__exec">
          <div className="report-replay__exec-head">
            <div className="report-replay__exec-title">
              <span>#3</span>
              <strong>aiAct</strong>
              <span className="report-replay__status">
                <Check size={10} strokeWidth={2.5} />
                Passed
              </span>
            </div>
            <p className="report-replay__prompt">{t('reportReplayPrompt')}</p>
          </div>

          <div className="report-replay__exec-cols">
            <span>Execution</span>
            <span>Time</span>
          </div>

          <div className="report-replay__actions">
            {frames.map((frame, index) => (
              <div
                key={frame.id}
                data-active={activeFrame === index}
                className="report-replay__action-row"
              >
                <Check
                  size={11}
                  strokeWidth={2.4}
                  className="report-replay__ok"
                />
                <span className="report-replay__action-type">{frame.type}</span>
                <Video
                  size={11}
                  strokeWidth={1.7}
                  className="report-replay__cam"
                />
                <span className="report-replay__action-time">{frame.time}</span>
              </div>
            ))}
          </div>

          <div className="report-replay__totals">
            <div>
              <span>Elapsed</span>
              <span>3.75s</span>
            </div>
            <div>
              <span>Model</span>
              <span>2.24s</span>
            </div>
          </div>
        </div>

        {/* Right pane: Record timeline + screenshot replay */}
        <div className="report-replay__record">
          <div className="report-replay__record-head">
            <span className="report-replay__record-label">
              <Play size={11} strokeWidth={2} />
              Record
            </span>
            <span className="report-replay__record-now">
              {current.type} · {current.time}
            </span>
          </div>

          {/* Horizontal filmstrip timeline */}
          <div className="report-replay__timeline">
            {frames.map((frame, index) => (
              <div
                key={frame.id}
                data-active={activeFrame === index}
                className="report-replay__thumb-btn"
              >
                <span className="report-replay__tick">{frame.at}</span>
                <span className="report-replay__mini-screen">
                  <span className="report-replay__mini-bar" />
                  <span
                    className="report-replay__mini-box"
                    data-hot={frame.highlight !== 'none'}
                  />
                </span>
              </div>
            ))}
          </div>

          {/* Main screenshot stage */}
          <div className="report-replay__stage">
            <div className="report-replay__screen">
              <div className="report-replay__screen-title">
                {t('reportReplayPageTitle')}
              </div>
              <div className="report-replay__screen-search">
                <div
                  className="report-replay__screen-input"
                  data-highlight={current.highlight === 'input'}
                >
                  {current.inputValue || t('reportReplayPlaceholder')}
                  {current.cursor === 'input' && (
                    <MousePointer2
                      size={13}
                      strokeWidth={2}
                      className="report-replay__pointer"
                    />
                  )}
                </div>
                <div
                  className="report-replay__screen-btn"
                  data-highlight={current.highlight === 'button'}
                >
                  {t('reportReplaySearchBtn')}
                  {current.cursor === 'button' && (
                    <MousePointer2
                      size={13}
                      strokeWidth={2}
                      className="report-replay__pointer"
                    />
                  )}
                </div>
              </div>
              <div className="report-replay__screen-hint">
                {current.resultText}
              </div>
              <div className="report-replay__screen-product">
                <div>
                  <strong>{t('reportReplayItemName')}</strong>
                  <span>$89</span>
                </div>
                <span className="report-replay__screen-cta">
                  {t('reportReplayAddCart')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
