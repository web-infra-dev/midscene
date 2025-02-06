const readFile = require('fs').readFileSync;
const path = require('path');

const file = readFile(path.join(__dirname, 'element-tree.txt'), 'utf8');

const data = file.replace(/^\s*\n/gm, '');
console.log(data);