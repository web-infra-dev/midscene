// biome-ignore lint/style/useNodejsImportProtocol: <explanation>
import { Buffer } from 'buffer';

window.global ||= window;
window.Buffer = Buffer;

let sideEffect = 0;

export const setSideEffect = () => {
  sideEffect++;
  return sideEffect;
};
