import React, {
  type ReactNode,
  createContext,
  useContext,
  useId,
  useState,
} from 'react';
import './SdkPlatform.css';

const platforms = ['android', 'ios', 'harmonyos', 'desktop'] as const;
type Platform = (typeof platforms)[number];

const PlatformContext = createContext<{
  platform: Platform;
  setPlatform: (platform: Platform) => void;
} | null>(null);

function usePlatform() {
  const context = useContext(PlatformContext);
  if (!context) {
    throw new Error(
      'SDK platform components must be inside SdkPlatformProvider',
    );
  }
  return context;
}

export function SdkPlatformProvider({ children }: { children?: ReactNode }) {
  const [platform, setPlatform] = useState<Platform>('android');
  return (
    <PlatformContext.Provider value={{ platform, setPlatform }}>
      {children}
    </PlatformContext.Provider>
  );
}

export function SdkPlatformSelector({ lang }: { lang: 'en' | 'zh' }) {
  const { platform, setPlatform } = usePlatform();
  const name = useId();
  const labels: Record<Platform, string> = {
    android: 'Android',
    ios: 'iOS',
    harmonyos: 'HarmonyOS',
    desktop: lang === 'zh' ? '桌面端' : 'Desktop',
  };

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
  return selected.platform === platform ? <>{children}</> : null;
}
