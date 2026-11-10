# Release

## One-time repository setup

1. Create the GitHub repository and push `main`.
2. Enable branch protection for `main`, Dependabot alerts, CodeQL, and secret
   scanning.
3. No npm token is required. The release publishes signed binaries to GitHub
   Releases and signed images to GHCR.
4. After the first image publish, set the GHCR package visibility to public if
   users should pull without authentication.

## Cut a release

1. Update `CHANGELOG.md` and the version in `package.json`.
2. If dependencies changed, run `bun install` so `bun.lock` matches.
3. Commit the version and changelog changes.
4. Tag and push:

   ```bash
   git tag v1.2.3
   git push origin main v1.2.3
   ```

   The `verify` job fails if the tag does not match `package.json`.

## What the workflow does

- **verify:** `bun ci`, `bun audit`, typecheck, lint, content validation, tests,
  build, HTTP smoke, local-JWKS OAuth smoke, and `bun pm pack --dry-run`.
- **oauth:** starts the reference Keycloak realm and runs `bun run smoke:oauth`.
- **binaries:** builds macOS arm64/x64 and Linux arm64/x64, smokes the Linux
  binary, writes `SHA256SUMS`, signs it with cosign, and publishes a GitHub
  Release.
- **image:** builds the multi-arch Bun server image, pushes to GHCR with SBOM
  and provenance, and signs the digest.
- **audit-image:** builds the Node/Playwright audit image for `linux/amd64`,
  pushes the `-audit` tag, and signs it.

The npm package is intentionally not published at launch. `bun publish` does
not generate provenance yet; if the package channel is added later, decide
whether to accept that or keep a narrow `npm publish --provenance` exception.

## Verify a release

```bash
gh release download v1.2.3 --pattern 'tastepro-*' --pattern 'SHA256SUMS*'
sha256sum -c SHA256SUMS
cosign verify-blob SHA256SUMS \
  --bundle SHA256SUMS.bundle \
  --certificate-identity-regexp 'https://github.com/<owner>/tastepro' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com

docker pull ghcr.io/<owner>/tastepro:1.2.3
cosign verify ghcr.io/<owner>/tastepro:1.2.3 \
  --certificate-identity-regexp 'https://github.com/<owner>/tastepro' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

Run the container with `TASTEPRO_ALLOWED_HOSTS` set; the image binds `0.0.0.0`
and fails closed without it.

For the audit image, run with `--shm-size=1g --memory=2g --cpus=2` and call
`taste_audit` with `mode: "browser"`.

## Rollback

Deploy the previous image tag or binary. Content is immutable per artifact, so
rollback also rolls back the catalog and content hash. If you use an external
`TASTEPRO_CONTENT_DIR`, roll that back at the same time.
