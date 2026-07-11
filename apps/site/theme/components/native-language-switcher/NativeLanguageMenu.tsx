export interface NativeLanguageMenuItem {
  href?: string;
  label: string;
  lang: string;
}

interface NativeLanguageMenuProps {
  activeLabel: string;
  items: NativeLanguageMenuItem[];
}

export function NativeLanguageMenu({
  activeLabel,
  items,
}: NativeLanguageMenuProps) {
  return (
    <div className="site-language-menu rp-nav-menu__item">
      <details className="site-language-menu__details" suppressHydrationWarning>
        <summary
          className="site-language-menu__summary rp-nav-menu__item__container"
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ')
              event.stopPropagation();
          }}
        >
          <span>{activeLabel}</span>
          <svg
            aria-hidden="true"
            className="rp-nav-menu__item__icon"
            width="1em"
            height="1em"
            viewBox="0 0 32 32"
          >
            <path
              fill="currentColor"
              d="M16 22 6 12l1.4-1.4 8.6 8.6 8.6-8.6L26 12z"
            />
          </svg>
        </summary>
      </details>
      <ul className="site-language-menu__list rp-hover-group rp-hover-group--right">
        {items.map((item) => (
          <li
            key={item.lang}
            className={`rp-hover-group__item${item.href ? '' : ' rp-hover-group__item--active'}`}
            data-depth="0"
          >
            {item.href ? (
              <a
                href={item.href}
                className="rp-hover-group__item__link"
                aria-label={item.label}
                hrefLang={item.lang}
                lang={item.lang}
                rel="alternate"
              >
                {item.label}
              </a>
            ) : (
              <span
                className="rp-hover-group__item__link"
                aria-current="page"
                lang={item.lang}
              >
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
