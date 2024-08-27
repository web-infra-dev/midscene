import { extractTextWithPosition } from '.';

console.log(extractTextWithPosition(document.body, true));
console.log(JSON.stringify(extractTextWithPosition(document.body, false)));
(window as any).extractTextWithPosition = extractTextWithPosition;
