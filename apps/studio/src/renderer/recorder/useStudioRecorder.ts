import { createContext, useContext } from 'react';
import type { StudioRecorderContextValue } from './types';

export const StudioRecorderContext =
  createContext<StudioRecorderContextValue | null>(null);

export function useStudioRecorder(): StudioRecorderContextValue {
  const context = useContext(StudioRecorderContext);

  if (!context) {
    throw new Error(
      'useStudioRecorder must be used within StudioRecorderProvider',
    );
  }

  return context;
}

export function useOptionalStudioRecorder(): StudioRecorderContextValue | null {
  return useContext(StudioRecorderContext);
}
