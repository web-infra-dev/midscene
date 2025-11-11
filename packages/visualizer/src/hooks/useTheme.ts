import { useEffect, useState } from 'react';

/**
 * Hook to detect and observe the current theme (light/dark mode)
 * @returns Object containing isDarkMode boolean
 */
export function useTheme() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    // Check initial theme
    const checkTheme = () => {
      const theme = document
        .querySelector('[data-theme]')
        ?.getAttribute('data-theme');
      setIsDarkMode(theme === 'dark');
    };

    checkTheme();

    // Observe theme changes
    const observer = new MutationObserver(checkTheme);
    const target =
      document.querySelector('[data-theme]') || document.documentElement;

    observer.observe(target, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, []);

  return { isDarkMode };
}
