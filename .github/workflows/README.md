# Workflows

- **`ci.yml`** — runs on every push to `develop` and every pull request into `main`: install, lint, typecheck, apply migrations to dev (push only), unit tests, the smoke suite, and a build of both apps. Consumes `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DEV_PROJECT_REF`, `SUPABASE_DEV_DB_PASSWORD`, `SMOKE_API_BASE_URL`, `SMOKE_SUPABASE_URL`, `SMOKE_SUPABASE_SERVICE_ROLE_KEY` — by name only, never by value.
- No workflow in this directory may ever reference a production Supabase secret. CI touches the dev project only; production migrations are applied by hand (SPEC-FINAL §19.4).
