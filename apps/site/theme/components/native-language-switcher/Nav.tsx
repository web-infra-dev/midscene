import {
  type NavProps,
  Nav as OriginalNav,
} from '@rspress/core/theme-original';
import { NativeLanguageSwitcher } from './NativeLanguageSwitcher';
import { NativeMobileNav } from './NativeMobileNav';

export function Nav({ afterNavMenu, ...props }: NavProps) {
  return (
    <OriginalNav
      {...props}
      afterNavMenu={
        <>
          {afterNavMenu}
          <NativeLanguageSwitcher />
          <NativeMobileNav />
        </>
      }
    />
  );
}
