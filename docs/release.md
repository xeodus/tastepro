# Release

## One-time repository setup

1. Create the GitHub repository and push `main`.
2. Enable branch protection for `main`, Dependabot alerts, CodeQL, and secret
   scanning.
3. **First publish only.** Create a granular npm token with publish rights and
   store it as the `NPM_TOKEN` secret. Set the repository variable
   `NPM_PUBLISH=true`. Trusted publishing cannot be configured before the
   package exists: `npm trust` explicitly requires it.
4. After the first release is live, configure the trusted publisher:

   ```bash
   npm trust github tastepro \
     --file release.yml \
     --repo xeodus/tastepro \
     --allow-publish
   ```

   This requires npm 11.15+, 2FA on the npm account, and write access to the
   package. Then revoke `NPM_TOKEN`; later releases authenticate through OIDC.
   A new trusted publisher configuration expires if its first publish does not
   happen within 2 days, so configure it just before the next release.
5. Set the repository variable `MCP_REGISTRY_PUBLISH=true`.
6. After the first image publish, set the GHCR package visibility to public if
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
  build, HTTP smoke, local-JWKS OAuth smoke, and `npm pack --dry-run`.
- **oauth:** starts the reference Keycloak realm and runs `bun run smoke:oauth`.
- **binaries:** builds macOS arm64/x64 and Linux arm64/x64, smokes the Linux
  binary, writes `SHA256SUMS`, signs it with cosign, and publishes a GitHub
  Release.
- **image:** builds the multi-arch Bun server image, pushes to GHCR with SBOM
  and provenance, and signs the digest.
- **audit-image:** builds the Node/Playwright audit image for `linux/amd64`,
  pushes the `-audit` tag, and signs it.
- **npm:** publishes `tastepro` to npmjs with provenance through trusted
  publishing. Gated by `NPM_PUBLISH=true`.
- **registry:** installs `mcp-publisher`, validates `server.json`, authenticates
  with GitHub OIDC, and publishes to the official MCP Registry. Gated by
  `MCP_REGISTRY_PUBLISH=true`; requires the npm and image jobs to succeed.

`server.json` must list the exact npm version and the OCI image tag for the
release. The package test enforces version parity; the registry rejects
mismatches.

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

npm view tastepro version
npm audit signatures
curl -fsS "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.xeodus/tastepro" \
  | jq -e '.servers | length > 0'
```

Run the container with `TASTEPRO_ALLOWED_HOSTS` set; the image binds `0.0.0.0`
and fails closed without it.

For the audit image, run with `--shm-size=1g --memory=2g --cpus=2` and call
`taste_audit` with `mode: "browser"`.

## Rollback

Deploy the previous image tag or binary. Content is immutable per artifact, so
rollback also rolls back the catalog and content hash. If you use an external
`TASTEPRO_CONTENT_DIR`, roll that back at the same time.
