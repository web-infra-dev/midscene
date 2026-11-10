import React, {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
} from 'react';
import './SdkPlatform.css';

const platforms = ['android', 'ios', 'harmonyos', 'desktop'] as const;
type Platform = (typeof platforms)[number];

type Lang = 'en' | 'zh';

const PlatformContext = createContext<{
  lang: Lang;
  platform: Platform;
  // Set when the page fixes the platform, such as a Get started path page.
  fixed: boolean;
  setPlatform: (platform: Platform) => void;
} | null>(null);

function platformLabels(lang: Lang): Record<Platform, string> {
  return {
    android: 'Android',
    ios: 'iOS',
    harmonyos: 'HarmonyOS',
    desktop: lang === 'zh' ? '桌面端' : 'Desktop',
  };
}

function usePlatform() {
  const context = useContext(PlatformContext);
  if (!context) {
    throw new Error(
      'SDK platform components must be inside SdkPlatformProvider',
    );
  }
  return context;
}

export function parsePlatform(search: string): Platform | undefined {
  const value = new URLSearchParams(search).get('platform');
  return platforms.find((platform) => platform === value);
}

// `?platform=` preselects a platform on the Vitest guide. A fixed `platform`
// shows only that platform, for example on a Get started path page.
export function SdkPlatformProvider({
  lang = 'en',
  platform: fixedPlatform,
  children,
}: {
  lang?: Lang;
  platform?: Platform;
  children?: ReactNode;
}) {
  const [platform, setPlatformState] = useState<Platform>(
    fixedPlatform ?? 'android',
  );

  useEffect(() => {
    if (fixedPlatform) return;
    const fromUrl = parsePlatform(window.location.search);
    if (fromUrl) setPlatformState(fromUrl);
  }, [fixedPlatform]);

  const setPlatform = (next: Platform) => {
    setPlatformState(next);
    const url = new URL(window.location.href);
    url.searchParams.set('platform', next);
    window.history.replaceState(window.history.state, '', url);
  };

  return (
    <PlatformContext.Provider
      value={{
        lang,
        platform: fixedPlatform ?? platform,
        fixed: Boolean(fixedPlatform),
        setPlatform,
      }}
    >
      {children}
    </PlatformContext.Provider>
  );
}

export function SdkPlatformSelector({ lang }: { lang: 'en' | 'zh' }) {
  const { platform, setPlatform } = usePlatform();
  const name = useId();
  const labels = platformLabels(lang);
  // Markdown output lists every platform, so there is nothing to choose.
  if (import.meta.env.SSG_MD) return null;

  return (
    <fieldset className="sdk-platform-selector">
      <legend>{lang === 'zh' ? '选择接入平台' : 'Choose your platform'}</legend>
      <div className="sdk-platform-options">
        {platforms.map((value) => (
          <label key={value}>
            <input
              type="radio"
              name={name}
              value={value}
              checked={platform === value}
              onChange={() => setPlatform(value)}
            />
            <span>{labels[value]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SdkPlatformContent({
  platform,
  children,
}: {
  platform: Platform;
  children?: ReactNode;
}) {
  const selected = usePlatform();
  // The Markdown output of the guide lists every platform under its name.
  if (import.meta.env.SSG_MD && !selected.fixed) {
    return (
      <div>
        <p>
          <strong>{platformLabels(selected.lang)[platform]}</strong>
        </p>
        {children}
      </div>
    );
  }
  return selected.platform === platform ? <>{children}</> : null;
}
