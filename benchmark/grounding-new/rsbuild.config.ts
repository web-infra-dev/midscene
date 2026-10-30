import { getRequestListener } from '@hono/node-server';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { datasetApp } from './viewer/server';

const handleDatasetRequest = getRequestListener(datasetApp.fetch);

export default defineConfig({
  plugins: [pluginReact()],
  source: { entry: { index: './viewer/src/App.tsx' } },
  html: { template: './viewer/index.html' },
  server: {
    host: '0.0.0.0',
    port: 4319,
    strictPort: true,
    htmlFallback: false,
    historyApiFallback: {
      rewrites: [
        {
          from: /^\/(?:testcases(?:\/[^/]+)?|evaluations(?:\/[^/]+){0,2})?\/?$/,
          to: '/index.html',
        },
        { from: /./, to: ({ parsedUrl }) => parsedUrl.pathname },
      ],
    },
    setup: ({ server }) => {
      server.middlewares.use((request, response, next) => {
        if (
          request.url?.startsWith('/api/') ||
          request.url?.startsWith('/images/') ||
          request.url?.startsWith('/results/')
        ) {
          void handleDatasetRequest(request, response);
        } else {
          next();
        }
      });
    },
  },
});
