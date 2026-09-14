import { describe, expect, it } from 'vitest';
import { parseWorksheet, renderEnvExample } from './gen-env-example.mjs';

const WORKSHEET = `
## 1. Client — \`apps/client/.env.example\`

| Variable | What it is | Where you get it | Secret? | Dev / Preview value | Production value | Set? |
|---|---|---|---|---|---|:---:|
| \`VITE_API_BASE_URL\` | Base URL of the server API | The server's Vercel project URL | No | \`https://leaked.example.com\` | \` \` | ☐ |
| \`VITE_DEVICE_WIPE_CODE\` | The code a lead types | You choose it | **No** — it ships in the JS bundle. | \`1234\` | \` \` | ☐ |

## 2. Server — \`apps/server/.env.example\`

| Variable | What it is | Where you get it | Secret? | Dev / Preview value | Production value | Set? |
|---|---|---|---|---|---|:---:|
| \`SUPABASE_URL\` | Project REST URL | Supabase → Settings → API | No | \` \` | \` \` | ☐ |
| \`AUTH_JWT_SECRET\` | HS256 signing secret | Generate: \`openssl rand -base64 48\` | **YES** | \` \` | \` \` | ☐ |

## 3. GitHub Actions secrets
`;

describe('gen-env-example', () => {
  it('reads the client and server tables', () => {
    const { client, server } = parseWorksheet(WORKSHEET);
    expect(client.map((v) => v.name)).toEqual(['VITE_API_BASE_URL', 'VITE_DEVICE_WIPE_CODE']);
    expect(server.map((v) => v.name)).toEqual(['SUPABASE_URL', 'AUTH_JWT_SECRET']);
  });

  it('marks secret variables', () => {
    const { server } = parseWorksheet(WORKSHEET);
    expect(server.find((v) => v.name === 'AUTH_JWT_SECRET')?.secret).toBe(true);
    expect(server.find((v) => v.name === 'SUPABASE_URL')?.secret).toBe(false);
  });

  it('never copies a value out of the worksheet, even a non-secret one', () => {
    const rendered = renderEnvExample('client', parseWorksheet(WORKSHEET).client);
    expect(rendered).not.toContain('leaked.example.com');
    expect(rendered).not.toContain('1234');
  });

  it('emits every name with an empty placeholder and its documentation', () => {
    const rendered = renderEnvExample('client', parseWorksheet(WORKSHEET).client);
    expect(rendered).toContain('# Base URL of the server API');
    expect(rendered).toContain("# Where: The server's Vercel project URL");
    expect(rendered).toMatch(/^VITE_API_BASE_URL=$/m);
  });

  it('warns in the header that the file is generated and holds no real values', () => {
    const rendered = renderEnvExample('server', parseWorksheet(WORKSHEET).server);
    expect(rendered).toContain('generated from docs/ops/ENVIRONMENT.md');
    expect(rendered).toContain('pnpm env:example');
    expect(rendered).toContain('No real value belongs in this file');
  });

  it('throws a readable error when a section heading is missing', () => {
    expect(() => parseWorksheet('# nothing here')).toThrowError(/## 1\. Client/);
  });
});
