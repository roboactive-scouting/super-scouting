import { handle } from 'hono/vercel';
import { buildApp } from '../src/composition';

export const config = { runtime: 'nodejs' };

const app = buildApp();

export const GET = handle(app);
export const POST = handle(app);
export const OPTIONS = handle(app);
