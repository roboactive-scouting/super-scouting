# Workflows

- **`ci.yml`** — runs on every push to `develop` and every pull request into `main`: install, lint, typecheck, apply migrations to dev (push only), unit tests, the smoke suite, and a build of both apps. Consumes `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DEV_PROJECT_REF`, `SUPABASE_DEV_DB_PASSWORD`, `SMOKE_API_BASE_URL`, `SMOKE_SUPABASE_URL`, `SMOKE_SUPABASE_SERVICE_ROLE_KEY` — by name only, never by value.
- **`keepalive.yml`** — the one scheduled job in v1 (SPEC-FINAL §19.6), twice a week plus manual dispatch. GETs `/health` on both deployments to keep each Supabase free-tier project from idle-pausing. Consumes `HEALTHCHECK_DEV_URL` and `HEALTHCHECK_PROD_URL` — by name only, never by value. `HEALTHCHECK_PROD_URL` is a read-only `GET /health` against a public endpoint; it holds no credential.
- No workflow in this directory may ever reference a production Supabase secret. CI touches the dev project only; production migrations are applied by hand (SPEC-FINAL §19.4).
