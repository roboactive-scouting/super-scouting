import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { loadServerConfig } from './config.js';

const config = loadServerConfig({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  AUTH_JWT_SECRET: 'test-secret-at-least-32-characters-long!!',
  ALLOWED_ORIGIN: 'https://client.example.com',
  NODE_ENV: 'development',
});

const app = (over: Partial<Parameters<typeof createApp>[0]> = {}) =>
  createApp({ config, pingDatabase: async () => undefined, ...over });

describe('GET /health', () => {
  it('returns ok when the database read succeeds', async () => {
    const res = await app().request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', database: 'ok' });
  });

  it('returns 503 and names the failure when the database read fails', async () => {
    const res = await app({
      pingDatabase: async () => {
        throw new Error('relation "app_settings" does not exist');
      },
    }).request('/health');
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: 'error', database: 'error' });
  });
});

describe('CORS', () => {
  it('allows exactly the configured client origin', async () => {
    const res = await app().request('/health', {
      headers: { Origin: 'https://client.example.com' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://client.example.com');
  });

  it('does not allow another origin', async () => {
    const res = await app().request('/health', { headers: { Origin: 'https://evil.example.com' } });
    expect(res.headers.get('access-control-allow-origin')).not.toBe('https://evil.example.com');
  });
});

describe('mounted routes', () => {
  it('mounts everything passed in deps.routes', async () => {
    const extra = new Hono();
    extra.get('/extra', (c) => c.json({ ok: true }));
    const res = await app({ routes: [extra] }).request('/extra');
    expect(res.status).toBe(200);
  });
});

describe('unknown routes', () => {
  it('returns a JSON 404, never HTML', async () => {
    const res = await app().request('/nope');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});
