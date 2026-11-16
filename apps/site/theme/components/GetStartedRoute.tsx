import { useNavigate } from '@rspress/core/runtime';
import type { ComponentProps } from 'react';
import { GetStarted as GetStartedView } from './GetStarted';
import { pathSlug } from './get-started-plan';

// Kept apart from GetStarted.tsx so its unit tests do not load the Rspress
// runtime. Client-side navigation keeps path changes fast; the key remounts the
// view when the router reuses it for another path page.
export function GetStarted(
  props: Omit<ComponentProps<typeof GetStartedView>, 'navigate'>,
) {
  const navigate = useNavigate();
  return (
    <GetStartedView
      key={props.path ? pathSlug(props.path) : 'entry'}
      {...props}
      navigate={(to, options) => navigate(to, options)}
    />
  );
}
