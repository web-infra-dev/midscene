import { Suspense, lazy } from 'react';
import { useStudioPlayground } from '../../playground/useStudioPlayground';
import { PlaygroundShell } from '../PlaygroundShell';

declare const __APP_VERSION__: string;

const LazyPlaygroundConversationPanel = lazy(
  () => import('./LazyPlaygroundConversationPanel'),
);

export default function Playground() {
  const studioPlayground = useStudioPlayground();

  return (
    <PlaygroundShell>
      <div className="min-h-0 h-full flex-1 overflow-hidden">
        {studioPlayground.phase === 'booting' ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-[14px] leading-[22px] text-text-tertiary">
            Playground starting...
          </div>
        ) : studioPlayground.phase === 'error' ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="text-[14px] leading-[22px] text-text-secondary">
              {studioPlayground.error}
            </div>
            <button
              className="rounded-lg border border-border-subtle px-4 py-2 text-[13px] font-medium text-text-primary"
              onClick={() => {
                void studioPlayground.restartPlayground();
              }}
              type="button"
            >
              Retry runtime
            </button>
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center px-6 text-center text-[14px] leading-[22px] text-text-tertiary">
                Loading Playground…
              </div>
            }
          >
            <LazyPlaygroundConversationPanel
              appVersion={__APP_VERSION__}
              className="h-full"
              controller={studioPlayground.controller}
              title="Playground"
            />
          </Suspense>
        )}
      </div>
    </PlaygroundShell>
  );
}
