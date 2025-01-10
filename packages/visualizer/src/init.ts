// biome-ignore lint/style/useNodejsImportProtocol: <explanation>
import { Buffer } from 'buffer';

// To solve the '"global is not defined" in randomBytes
// https://www.perplexity.ai/search/how-to-solve-global-is-not-def-xOrpDcfOSKqz_IXtwmK4_Q
window.global ||= window;
window.Buffer = Buffer;

let sideEffect = 0;

export const setSideEffect = () => {
  sideEffect++;
  return sideEffect;
};
