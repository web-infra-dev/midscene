import { createContext } from 'react';
import type { LocaleContextValue } from './types';

export const LocaleContext = createContext<LocaleContextValue | null>(null);
