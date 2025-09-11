import hljs from 'highlight.js';
import { useEffect } from 'react';

// Import highlight.js themes
import 'highlight.js/styles/github.css';

export type SupportedLanguage = 'javascript' | 'yaml' | 'typescript' | 'json';

export interface CodeHighlightOptions {
  /** Whether to use auto-detection if specified language fails */
  autoDetect?: boolean;
  /** Custom class prefix for highlighted elements */
  classPrefix?: string;
}

/**
 * Hook for syntax highlighting using highlight.js
 * Provides a consistent way to highlight code across the application
 */
export const useCodeHighlight = (options: CodeHighlightOptions = {}) => {
  const { autoDetect = true, classPrefix = 'hljs-' } = options;

  // Initialize highlight.js configuration
  useEffect(() => {
    hljs.configure({
      languages: ['javascript', 'yaml', 'typescript', 'json'],
      classPrefix,
    });
  }, [classPrefix]);

  /**
   * Highlight code with specified language
   * @param code - Code string to highlight
   * @param language - Language for syntax highlighting
   * @returns Highlighted HTML string
   */
  const highlightCode = (code: string, language: SupportedLanguage): string => {
    if (!code?.trim()) {
      return code || '';
    }

    try {
      // Try to highlight with specified language
      const result = hljs.highlight(code, { language });
      return result.value;
    } catch (error) {
      console.warn(
        `Syntax highlighting failed for language '${language}':`,
        error,
      );

      // Fallback to auto-detection if enabled
      if (autoDetect) {
        try {
          const autoResult = hljs.highlightAuto(code);
          return autoResult.value;
        } catch (autoError) {
          console.warn('Auto-detection also failed:', autoError);
        }
      }

      // Final fallback: return plain text
      return code;
    }
  };

  /**
   * Get language display name
   */
  const getLanguageDisplayName = (language: SupportedLanguage): string => {
    const displayNames: Record<SupportedLanguage, string> = {
      javascript: 'JavaScript',
      typescript: 'TypeScript',
      yaml: 'YAML',
      json: 'JSON',
    };
    return displayNames[language] || language;
  };

  return {
    highlightCode,
    getLanguageDisplayName,
  };
};
