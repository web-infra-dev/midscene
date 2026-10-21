# Grounding testcase viewer

A read-only viewer for `../testcases`, implemented with TypeScript, React, Rsbuild, and Hono. It reads each case's `index.json` and original image directly, using only the current testcase schema. There are no review, comment, edit, or write APIs, and no UI component library.

Install workspace dependencies from the repository root, then start the Rsbuild development server:

```sh
pnpm install --ignore-scripts
```

```sh
pnpm --dir benchmark/grounding-new/viewer start
```

Open <http://127.0.0.1:4319>. To use another port:

```sh
pnpm --dir benchmark/grounding-new/viewer start --port 4320
```

React components and styles support hot updates. Restart the server after changing testcase files. The development server routes dataset requests through Hono on the same port.

Browse cases in lexicographic name order and filter by search text, platform, category, source dataset, or point/refusal outcome. Inspect both instruction languages, original screenshots, pixel TRBL ground truth, classification reasons, and all reference fields. The GT overlay follows the original image dimensions when zooming. `REFUSAL` cases have no box. Case URLs support hash links; previous/next navigation follows the filtered list.

The server binds to `127.0.0.1` and serves testcase records and original images without modifying their files.

Type-check and create a production build:

```sh
pnpm --dir benchmark/grounding-new/viewer typecheck
pnpm --dir benchmark/grounding-new/viewer build
```

Serve the built viewer with Hono:

```sh
pnpm --dir benchmark/grounding-new/viewer preview
```

The preview defaults to the same loopback address and port. Use `--port 4320` to run it alongside the development server.
