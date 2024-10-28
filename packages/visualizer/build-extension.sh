#! /bin/bash

echo 'cleaning unpacked-extension/'
rm -rf ./unpacked-extension/scripts
rm -rf ./unpacked-extension/pages

mkdir -p ./unpacked-extension/scripts
mkdir -p ./unpacked-extension/pages
mkdir -p ./unpacked-extension/lib
echo 'copying htmlElement.js to unpacked/scripts/'
cp ../web-integration/dist/script/htmlElement.js ./unpacked-extension/scripts/

echo 'copying playground index.html to unpacked/pages/'
cp ./dist/playground/index-with-outsource.html ./unpacked-extension/pages/playground.html
# cp ./dist/playground.js ./unpacked-extension/pages/playground.js
# echo ";midscenePlayground.default.mount('app');" >> ./unpacked-extension/pages/playground.js

# echo 'copying js files to unpacked/lib/'
# cp ./dist/lib/extension/* ./unpacked-extension/lib/
