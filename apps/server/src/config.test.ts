import { describe, expect, it } from 'vitest';
import { loadServerConfig } from './config.js';

const complete = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  AUTH_JWT_SECRET: 'test-secret-at-least-32-characters-long!!',
  ALLOWED_ORIGIN: 'http://localhost:5173',
  NODE_ENV: 'development',
};

describe('loadServerConfig', () => {
  it('parses a complete environment', () => {
    const config = loadServerConfig(complete);
    expect(config.supabaseUrl).toBe('https://example.supabase.co');
    expect(config.allowedOrigin).toBe('http://localhost:5173');
    expect(config.isProduction).toBe(false);
  });

  it('applies the documented defaults for the two token settings', () => {
    const config = loadServerConfig(complete);
    expect(config.tokenTtlDays).toBe(30);
    expect(config.tokenRefreshAfterDays).toBe(7);
  });

  it('fails loudly and names every missing variable', () => {
    expect(() => loadServerConfig({ NODE_ENV: 'development' })).toThrowError(
      /SUPABASE_URL[\s\S]*SUPABASE_SERVICE_ROLE_KEY[\s\S]*AUTH_JWT_SECRET[\s\S]*ALLOWED_ORIGIN/,
    );
  });

  it('names the offending variable when a value is present but wrong', () => {
    expect(() => loadServerConfig({ ...complete, AUTH_TOKEN_TTL_DAYS: 'thirty' })).toThrowError(
      /AUTH_TOKEN_TTL_DAYS/,
    );
  });

  it('never returns a silently undefined value', () => {
    const config = loadServerConfig(complete);
    for (const [key, value] of Object.entries(config)) {
      expect(value, `config.${key}`).toBeDefined();
    }
  });
});
