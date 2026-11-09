import { useLocation } from '@rspress/core/runtime';
import { EditLink as OriginalEditLink } from '@rspress/core/theme-original';
import React from 'react';
import { isGetStartedPathPage } from './get-started-plan';

export function EditLink(props: { isOutline?: boolean }) {
  const { pathname } = useLocation();
  // Generated setup pages live in Rspress temporary files, not the repository.
  if (isGetStartedPathPage(pathname)) return null;
  return <OriginalEditLink {...props} />;
}
