import { useLang } from '@rspress/core/runtime';
import { Children, type ReactNode, useEffect, useRef } from 'react';
import { revealModelConfigSection } from './model-config-section-anchor';
import './ModelConfigSection.css';

/** Keep a Markdown heading as the first child so Rspress retains its TOC entry. */
export function ModelConfigSection({
  description,
  children,
}: {
  description: string;
  children: ReactNode;
}) {
  const lang = useLang();
  const ref = useRef<HTMLDetailsElement>(null);
  const [heading, ...content] = Children.toArray(children);

  useEffect(() => {
    const section = ref.current;
    if (!section) return;
    const reveal = () => {
      if (revealModelConfigSection(section, window.location.hash)) {
        section.scrollIntoView({ block: 'start' });
      }
    };
    // Also handle selecting the current hash again after manually collapsing.
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest('a[href]');
      if (!link) return;
      const url = new URL(link.getAttribute('href')!, window.location.href);
      if (
        url.origin === window.location.origin &&
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        revealModelConfigSection(section, url.hash);
      }
    };
    reveal();
    window.addEventListener('hashchange', reveal);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('hashchange', reveal);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  return (
    <details ref={ref} className="model-config-section">
      <summary>
        <div className="model-config-section-heading">
          {heading}
          <span className="model-config-section-description">
            {description}
          </span>
        </div>
        <span className="model-config-section-action">
          <span className="model-config-section-show">
            {lang === 'zh' ? '查看配置' : 'View configuration'}
          </span>
          <span className="model-config-section-hide">
            {lang === 'zh' ? '收起配置' : 'Hide configuration'}
          </span>
          <span className="model-config-section-chevron" aria-hidden="true">
            ⌄
          </span>
        </span>
      </summary>
      <div className="model-config-section-content">{content}</div>
    </details>
  );
}
