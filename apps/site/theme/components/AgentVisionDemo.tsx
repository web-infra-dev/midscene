import { Check, MousePointer2, ScanEye } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import './AgentVision.css';

type Phase = 0 | 1 | 2;

export function AgentVisionDemo() {
  const t = useI18n();
  const [phase, setPhase] = useState<Phase>(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPhase((prev) => ((prev + 1) % 3) as Phase);
    }, 2400);
    return () => window.clearInterval(timer);
  }, []);

  const phaseLabels = [
    `01 · ${t('visionStepObserve')}`,
    `02 · ${t('visionStepAct')}`,
    `03 · ${t('visionStepVerify')}`,
  ] as const;

  return (
    <div
      className="vision-demo"
      data-phase={phase}
      aria-label="Vision loop animation"
    >
      {/* Mini app window */}
      <div className="vision-demo__window">
        <div className="vision-demo__bar">
          <span className="vision-demo__dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="vision-demo__url">your-shop.example</span>
          <span className="vision-demo__phase" data-phase={phase}>
            {phase === 0 && <ScanEye size={11} strokeWidth={1.8} />}
            {phase === 1 && <MousePointer2 size={11} strokeWidth={1.8} />}
            {phase === 2 && <Check size={11} strokeWidth={2.2} />}
            <span>{phaseLabels[phase]}</span>
          </span>
        </div>

        <div className="vision-demo__viewport">
          {/* Phase 0: Vision scan overlay */}
          <div className="vision-demo__scan" aria-hidden="true">
            <span className="vision-demo__corner vision-demo__corner--tl" />
            <span className="vision-demo__corner vision-demo__corner--tr" />
            <span className="vision-demo__corner vision-demo__corner--bl" />
            <span className="vision-demo__corner vision-demo__corner--br" />
            <span className="vision-demo__scanline" />
          </div>

          {/* Search & filter row */}
          <div className="vision-demo__toolbar">
            <div className="vision-demo__search">
              <span className="vision-demo__search-text">headphones</span>
            </div>
            <div className="vision-demo__filter" data-active={phase >= 1}>
              <span>&lt; $100</span>
              {phase === 1 && (
                <span className="vision-demo__reticle" aria-hidden="true">
                  <span className="vision-demo__coord">412, 94</span>
                </span>
              )}
            </div>
          </div>

          {/* Product cards */}
          <div className="vision-demo__cards">
            <div className="vision-demo__item" data-verified={phase === 2}>
              <div className="vision-demo__thumb" />
              <div className="vision-demo__lines">
                <span className="vision-demo__line vision-demo__line--lg" />
                <span className="vision-demo__line vision-demo__line--sm" />
              </div>
              <span className="vision-demo__price">$79</span>
            </div>

            <div className="vision-demo__item" data-verified={phase === 2}>
              <div className="vision-demo__thumb" />
              <div className="vision-demo__lines">
                <span className="vision-demo__line vision-demo__line--lg" />
                <span className="vision-demo__line vision-demo__line--sm" />
              </div>
              <span className="vision-demo__price">$89</span>
            </div>
          </div>

          {/* Animated pointer for Phase 1 */}
          <span className="vision-demo__cursor" aria-hidden="true">
            <MousePointer2 size={15} strokeWidth={1.8} />
          </span>

          {/* Verify pass pill for Phase 2 */}
          <div className="vision-demo__verify-pill" aria-hidden="true">
            <Check size={11} strokeWidth={2.4} />
            <span>aiAssert · passed</span>
          </div>
        </div>
      </div>
    </div>
  );
}
