# Release

## One-time repository setup

1. Create the GitHub repository and push `main`.
2. Enable branch protection for `main`, Dependabot alerts, CodeQL, and secret
   scanning.
3. Add an `NPM_TOKEN` repository secret with an npm automation token. The
   workflow uses the automatic `GITHUB_TOKEN` for GHCR.
4. The workflow runs with `id-token: write` for npm provenance and keyless
   cosign signing. Do not disable it.

The npm job injects `repository`, `homepage`, and `bugs` from
`GITHUB_REPOSITORY` before publishing, so the committed `package.json` does not
need a placeholder URL.

## Cut a release

1. Update `CHANGELOG.md` and bump the version:

   ```bash
   npm version 1.2.3 --no-git-tag-version
   ```
2. Commit the version and changelog changes.
3. Tag and push:

   ```bash
   git tag v1.2.3
   git push origin main v1.2.3
   ```

   The `verify` job fails if the tag does not match `package.json`.

## What the workflow does

- **verify:** typecheck, lint, content validation, tests, build, HTTP smoke, and
  `npm pack --dry-run`.
- **oauth:** starts the reference Keycloak realm and runs `npm run smoke:oauth`
  (real token, audit scope, scope denial, audience rejection).
- **image:** builds `linux/amd64` and `linux/arm64`, pushes to GHCR with SBOM
  and provenance, and signs the digest with cosign.
- **audit-image:** builds the optional Playwright image for `linux/amd64`,
  pushes the `-audit` tag, and signs it. Build locally for arm64 with
  `docker build -f Dockerfile.audit -t tastepro:audit .`.
- **npm:** publishes with provenance.

## Verify a release

```bash
docker pull ghcr.io/<owner>/tastepro:1.2.3
cosign verify ghcr.io/<owner>/tastepro:1.2.3 \
  --certificate-identity-regexp 'https://github.com/<owner>/tastepro' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
npm view tastepro version
```

Run the container with `TASTEPRO_ALLOWED_HOSTS` set; the image binds
`0.0.0.0` and fails closed without it.

For the audit image, run with `--shm-size=1g --memory=2g --cpus=2` and call
`taste_audit` with `mode: "browser"`.

## Rollback

Deploy the previous image tag. Content is immutable per image, so rollback also
rolls back the catalog and content hash. If you use an external
`TASTEPRO_CONTENT_DIR`, roll that back at the same time.
