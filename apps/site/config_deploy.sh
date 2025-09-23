#!/bin/bash

cat <<'HEADERS' > ./doc_build/_headers
/*.js
  Cache-Control: public, max-age=86400, must-revalidate

/*.css
  Cache-Control: public, max-age=86400, must-revalidate

/*
  Cache-Control: public, max-age=1800, must-revalidate
HEADERS
