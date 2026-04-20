import { createContext, useContext } from 'react';
import type { StudioPlaygroundContextValue } from './types';

export const StudioPlaygroundContext =
  createContext<StudioPlaygroundContextValue | null>(null);

export function useStudioPlayground(): StudioPlaygroundContextValue {
  const context = useContext(StudioPlaygroundContext);

  if (!context) {
    throw new Error(
      'useStudioPlayground must be used within StudioPlaygroundProvider',
    );
  }

  return context;
}
