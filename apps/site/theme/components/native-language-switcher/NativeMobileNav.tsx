import { useNav, withBase } from '@rspress/core/runtime';
import { NativeMobileMenu } from './NativeMobileMenu';

export function NativeMobileNav() {
  const items = useNav();
  return <NativeMobileMenu items={items} resolveHref={withBase} />;
}
