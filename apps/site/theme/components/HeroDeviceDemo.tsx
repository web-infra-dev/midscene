import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './HeroDeviceDemo.css';

type Platform = 'web' | 'ios' | 'android' | 'desktop' | 'harmony';
type Target = 'primary' | 'toggle' | 'input' | 'row';
type Phase = 'idle' | 'locate' | 'move' | 'press' | 'done' | 'assert';

interface Scene {
  platform: Platform;
  packageName: string;
  target: Target;
  action: string;
}

const scenes: Scene[] = [
  {
    platform: 'web',
    packageName: '@midscene/web',
    target: 'primary',
    action: 'aiTap',
  },
  {
    platform: 'ios',
    packageName: '@midscene/ios',
    target: 'toggle',
    action: 'aiTap',
  },
  {
    platform: 'android',
    packageName: '@midscene/android',
    target: 'input',
    action: 'aiInput',
  },
  {
    platform: 'desktop',
    packageName: '@midscene/computer',
    target: 'row',
    action: 'aiTap',
  },
  {
    platform: 'harmony',
    packageName: '@midscene/harmony',
    target: 'primary',
    action: 'aiTap',
  },
];

// The frame morphs during `idle`, so `idle` must outlast the CSS transition.
const timeline: [Phase, number][] = [
  ['idle', 900],
  ['locate', 900],
  ['move', 750],
  ['press', 300],
  ['done', 900],
  ['assert', 1400],
];

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Offsets ignore CSS transforms, so the tilted backdrop does not skew them.
function offsetWithin(element: HTMLElement, container: HTMLElement): Box {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = element;
  while (node && node !== container) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y, width: element.offsetWidth, height: element.offsetHeight };
}

function usePlayback(stage: React.RefObject<HTMLElement>) {
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    observer.observe(element);

    const onVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', onVisibility);

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = () => setReducedMotion(motion.matches);
    onMotion();
    motion.addEventListener('change', onMotion);

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      motion.removeEventListener('change', onMotion);
    };
  }, [stage]);

  return { playing: visible && pageVisible && !reducedMotion, reducedMotion };
}

export function HeroDeviceDemo() {
  const stageRef = useRef<HTMLDivElement>(null);
  const targetRefs = useRef<Partial<Record<Target, HTMLElement | null>>>({});
  const [sceneIndex, setSceneIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [box, setBox] = useState<Box | null>(null);
  const { playing, reducedMotion } = usePlayback(stageRef);
  const scene = scenes[sceneIndex];

  useEffect(() => {
    if (reducedMotion) {
      setPhase('assert');
      return;
    }
    if (!playing) return;
    let step = 0;
    let timer: ReturnType<typeof setTimeout>;
    const run = () => {
      const [nextPhase, duration] = timeline[step];
      setPhase(nextPhase);
      timer = setTimeout(() => {
        step += 1;
        if (step < timeline.length) {
          run();
        } else {
          setSceneIndex((index) => (index + 1) % scenes.length);
        }
      }, duration);
    };
    run();
    return () => clearTimeout(timer);
  }, [sceneIndex, playing, reducedMotion]);

  useLayoutEffect(() => {
    if (phase !== 'locate' && phase !== 'assert') return;
    const stage = stageRef.current;
    const target = targetRefs.current[scene.target];
    if (stage && target) setBox(offsetWithin(target, stage));
  }, [phase, scene.target]);

  const located = phase !== 'idle' && box !== null;
  const done = phase === 'done' || phase === 'assert';
  const touch = scene.platform !== 'web' && scene.platform !== 'desktop';
  const bind = (target: Target) => (element: HTMLElement | null) => {
    targetRefs.current[target] = element;
  };
  const cursorStyle = box
    ? {
        transform: `translate(${box.x + box.width / 2}px, ${
          box.y + box.height / 2
        }px)`,
      }
    : undefined;

  return (
    <div
      ref={stageRef}
      className="hero-demo"
      data-platform={scene.platform}
      data-phase={phase}
      data-done={done ? scene.target : undefined}
      aria-hidden="true"
    >
      <div className="hero-demo__frame">
        <div className="hero-demo__chrome">
          <span className="hero-demo__dots">
            <i />
            <i />
            <i />
          </span>
          <span className="hero-demo__address" />
          <span className="hero-demo__camera" />
        </div>
        <div className="hero-demo__screen">
          <div className="hero-demo__title" />
          <div className="hero-demo__line" />
          <div className="hero-demo__line hero-demo__line--short" />
          <div className="hero-demo__input" ref={bind('input')}>
            <span className="hero-demo__typed" />
          </div>
          <div className="hero-demo__actions">
            <span className="hero-demo__button" ref={bind('primary')} />
            <span className="hero-demo__button hero-demo__button--ghost" />
          </div>
          <div className="hero-demo__list">
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="hero-demo__row"
                ref={row === 1 ? bind('row') : undefined}
              >
                <span className="hero-demo__avatar" />
                <span className="hero-demo__row-line" />
                <span
                  className="hero-demo__toggle"
                  ref={row === 0 ? bind('toggle') : undefined}
                />
              </div>
            ))}
          </div>
        </div>
        <span className="hero-demo__home" />
      </div>

      <div
        className="hero-demo__locate"
        data-visible={located || undefined}
        style={
          box
            ? {
                transform: `translate(${box.x - 5}px, ${box.y - 5}px)`,
                width: box.width + 10,
                height: box.height + 10,
              }
            : undefined
        }
      >
        <span className="hero-demo__label">
          {phase === 'assert' ? '✓ aiAssert' : scene.action}
        </span>
      </div>

      <div
        className={`hero-demo__cursor hero-demo__cursor--${
          touch ? 'touch' : 'pointer'
        }`}
        data-moving={phase === 'move' || phase === 'press' || done || undefined}
        style={
          phase === 'move' || phase === 'press' || done
            ? cursorStyle
            : undefined
        }
      >
        <svg viewBox="0 0 16 20" width="16" height="20">
          <path d="M1 1l13 10.5-6 .7 3.4 6.6-2.4 1.2-3.4-6.7L1 17.2z" />
        </svg>
      </div>

      <code className="hero-demo__package" key={scene.packageName}>
        {scene.packageName}
      </code>
    </div>
  );
}
