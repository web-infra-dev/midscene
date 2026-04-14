import { PlaygroundConversationPanel } from '@midscene/playground-app';
import { useStudioPlayground } from '../../playground/useStudioPlayground';

declare const __APP_VERSION__: string;

export default function Playground() {
  const studioPlayground = useStudioPlayground();

  return (
    <div className="flex h-full w-[400px] shrink-0 flex-col overflow-hidden rounded-r-[12px] bg-surface">
      <div className="flex h-[56px] items-center px-[22px]">
        <span className="text-[13px] leading-[22.1px] font-medium text-text-primary">
          Playground
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4">
        {studioPlayground.phase === 'booting' ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-[14px] leading-[22px] text-black/60">
            Android playground starting...
          </div>
        ) : studioPlayground.phase === 'error' ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="text-[14px] leading-[22px] text-black/70">
              {studioPlayground.error}
            </div>
            <button
              className="rounded-lg border border-[#ECECEC] px-4 py-2 text-[13px] font-medium text-black/90"
              onClick={() => {
                void studioPlayground.restartAndroidPlayground();
              }}
              type="button"
            >
              Retry Android runtime
            </button>
          </div>
        ) : (
          <PlaygroundConversationPanel
            appVersion={__APP_VERSION__}
            className="h-full"
            controller={studioPlayground.controller}
            title="Android Playground"
          />
        )}
      </div>
    </div>
  );
}
