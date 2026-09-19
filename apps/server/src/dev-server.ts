import { serve } from '@hono/node-server';
import { buildApp } from './composition.js';

serve({ fetch: buildApp().fetch, port: 3000 }, (info) => {
  console.warn(`server listening on http://localhost:${info.port}`);
});
