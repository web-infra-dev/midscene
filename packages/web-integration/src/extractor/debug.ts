import { webExtractTextWithPosition } from '.';
import { setExtractTextWithPositionOnWindow } from './util';

console.log(webExtractTextWithPosition(document.body, true));
console.log(JSON.stringify(webExtractTextWithPosition(document.body, true)));
setExtractTextWithPositionOnWindow();
