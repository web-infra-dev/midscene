#!/bin/bash

set -e

npm i -g pnpm@7

pnpm install

npm run build

mkdir output
mkdir output_resource

cp -rf doc_build/* ./output
cp -rf doc_build/* ./output_resource


if [ -f route.json ]; then
  cp route.json ./output
fi
