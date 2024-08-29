import { extractTextWithPosition } from '.';
import { setExtractTextWithPositionOnWindow } from './util';

console.log(extractTextWithPosition(document.body, true));
console.log(JSON.stringify(extractTextWithPosition(document.body, false)));
setExtractTextWithPositionOnWindow();
