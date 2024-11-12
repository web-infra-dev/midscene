#! /bin/bash

node ../cli/bin/midscene --serve ./dist/report --url demo.html \
  --action "Click the 'Insight / Locate' on Left" \
  --sleep 300 \
  --assert "There is a 'Open in Playground' button on the page"
