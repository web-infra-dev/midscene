#!/bin/bash

cat <<'HEADERS' > ./doc_build/_headers
/images/platforms/android-dark.png
  X-Robots-Tag: noindex

/images/platforms/android-light.png
  X-Robots-Tag: noindex

/*.js
  Cache-Control: public, max-age=86400, must-revalidate

/*.css
  Cache-Control: public, max-age=86400, must-revalidate

/*
  Cache-Control: public, max-age=1800, must-revalidate
HEADERS
