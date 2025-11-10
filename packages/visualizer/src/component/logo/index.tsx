import { useEffect, useState } from 'react';
import './index.less';

export const LogoUrl =
  'https://lf3-static.bytednsdoc.com/obj/eden-cn/vhaeh7vhabf/Midscene.png';

const LogoUrlLight =
  'https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/midscene_with_text_light.png';
const LogoUrlDark =
  'https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/midscene_with_text_dark.png';

export const Logo = ({ hideLogo = false }: { hideLogo?: boolean }) => {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Check initial theme
    const checkTheme = () => {
      const theme = document.querySelector('[data-theme]')?.getAttribute('data-theme');
      setIsDark(theme === 'dark');
    };

    checkTheme();

    // Observe theme changes
    const observer = new MutationObserver(checkTheme);
    const target = document.querySelector('[data-theme]') || document.documentElement;

    observer.observe(target, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, []);

  if (hideLogo) {
    return null;
  }

  const logoSrc = isDark ? LogoUrlDark : LogoUrlLight;

  return (
    <div className="logo">
      <a href="https://midscenejs.com/" target="_blank" rel="noreferrer">
        <img
          alt="Midscene_logo"
          src={logoSrc}
        />
      </a>
    </div>
  );
};
