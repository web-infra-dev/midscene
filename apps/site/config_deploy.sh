#!/bin/bash

cat <<'HEADERS' > ./doc_build/_headers
/*.js
  Cache-Control: public, max-age=31536000, immutable

/*.css
  Cache-Control: public, max-age=31536000, immutable

/*
  Cache-Control: public, max-age=1800, must-revalidate
HEADERS
