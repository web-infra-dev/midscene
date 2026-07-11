import type { NavItem } from '@rspress/core';

interface NativeMobileMenuProps {
  items: NavItem[];
  resolveHref?: (href: string) => string;
}

function NavItemLabel({ item }: { item: NavItem }) {
  return (
    <>
      {item.text}
      {item.tag ? (
        <span className="site-mobile-nav__tag">{item.tag}</span>
      ) : null}
    </>
  );
}

function NativeMobileNavItem({
  item,
  resolveHref,
}: {
  item: NavItem;
  resolveHref: (href: string) => string;
}) {
  const hasChildren =
    'items' in item && Array.isArray(item.items) && item.items.length > 0;
  const hasLink =
    'link' in item && typeof item.link === 'string' && item.link.length > 0;

  if (hasChildren) {
    return (
      <details className="site-mobile-nav__group" suppressHydrationWarning>
        <summary className="site-mobile-nav__item site-mobile-nav__group-summary">
          <NavItemLabel item={item} />
          <svg
            aria-hidden="true"
            className="site-mobile-nav__arrow"
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
        <div className="site-mobile-nav__group-items">
          {hasLink ? (
            <a
              className="site-mobile-nav__item site-mobile-nav__group-link"
              href={resolveHref(item.link)}
              hrefLang={item.lang}
              lang={item.lang}
              rel={item.rel}
            >
              <NavItemLabel item={item} />
            </a>
          ) : null}
          {item.items.map((child, index) => (
            <NativeMobileNavItem
              key={`${child.text || 'item'}-${index}`}
              item={child}
              resolveHref={resolveHref}
            />
          ))}
        </div>
      </details>
    );
  }

  if (hasLink) {
    return (
      <a
        className="site-mobile-nav__item"
        href={resolveHref(item.link)}
        download={'download' in item ? item.download : undefined}
        hrefLang={item.lang}
        lang={item.lang}
        rel={item.rel}
      >
        <NavItemLabel item={item} />
      </a>
    );
  }

  return (
    <span className="site-mobile-nav__item site-mobile-nav__item--label">
      {item.text}
    </span>
  );
}

export function NativeMobileMenu({
  items,
  resolveHref = (href) => href,
}: NativeMobileMenuProps) {
  if (items.length === 0) return null;

  return (
    <details className="site-mobile-nav" suppressHydrationWarning>
      <summary
        className="site-mobile-nav__toggle"
        aria-label="Mobile navigation"
      >
        <svg
          aria-hidden="true"
          width="21"
          height="21"
          fill="none"
          viewBox="0 0 21 21"
        >
          <path
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.667"
            d="M3.645 5.225h13.333M3.645 10.225h13.333M3.645 15.225h13.333"
          />
        </svg>
      </summary>
      <nav className="site-mobile-nav__panel" aria-label="Mobile navigation">
        {items.map((item, index) => (
          <NativeMobileNavItem
            key={`${item.text || 'item'}-${index}`}
            item={item}
            resolveHref={resolveHref}
          />
        ))}
      </nav>
    </details>
  );
}
