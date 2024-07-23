/** Everything you need to parse a query */
import getAllContentScript from './fixture/script_get_all_texts';
import { retrieveElement, retrieveSection as promptOneSection } from '@/ai-model/prompt/util';

export function pageScriptToGetTexts(selector?: string) {
  let prependScript = '';
  if (selector) {
    if (selector.startsWith('#')) {
      const id = selector.slice(1);
      prependScript = `window.get_all_text_container = document.getElementById('${id}');`;
    } else {
      throw new Error(`selector not supported yet: ${selector}. Only id selector (#id-name) is supported.`);
    }
  }

  const script = prependScript + getAllContentScript;
  return script;
}

export const getElement = retrieveElement;
export const getSection = promptOneSection;
