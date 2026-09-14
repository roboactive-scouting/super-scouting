import { describe, expect, it } from 'vitest';
import { loadClientConfig } from './config';

const complete = {
  VITE_API_BASE_URL: 'https://api.example.com',
  VITE_DEVICE_WIPE_CODE: '2096',
  VITE_APP_VERSION: 'abc1234',
};

describe('loadClientConfig', () => {
  it('parses a complete environment', () => {
    const config = loadClientConfig(complete);
    expect(config.apiBaseUrl).toBe('https://api.example.com');
    expect(config.deviceWipeCode).toBe('2096');
    expect(config.appVersion).toBe('abc1234');
  });

  it('strips a trailing slash from the API base URL', () => {
    expect(
      loadClientConfig({ ...complete, VITE_API_BASE_URL: 'https://api.example.com/' }).apiBaseUrl,
    ).toBe('https://api.example.com');
  });

  it('fails loudly and names every missing variable', () => {
    expect(() => loadClientConfig({})).toThrowError(
      /VITE_API_BASE_URL[\s\S]*VITE_DEVICE_WIPE_CODE/,
    );
  });

  it('defaults the version to "unknown" rather than undefined', () => {
    const config = loadClientConfig({
      VITE_API_BASE_URL: 'https://api.example.com',
      VITE_DEVICE_WIPE_CODE: '2096',
    });
    expect(config.appVersion).toBe('unknown');
  });
});
