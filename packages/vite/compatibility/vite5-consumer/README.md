# Isolated Vite consumer

This fixture tests the built npm package, not workspace source imports. Run it in a temporary directory so the package resolves the consumer's Vite version for its worker sub-build.

From the repository root, after `pnpm build`:

```sh
fixture_dir="$(mktemp -d)"
cp -R packages/vite/compatibility/vite5-consumer/. "$fixture_dir/"
pnpm --filter @pwa-platform/vite pack --pack-destination "$fixture_dir"
mv "$fixture_dir"/pwa-platform-vite-*.tgz "$fixture_dir/adapter.tgz"
cd "$fixture_dir"
corepack pnpm@8.6.5 install --ignore-scripts
corepack pnpm@8.6.5 install --frozen-lockfile --offline --ignore-scripts
corepack pnpm@8.6.5 exec tsc --noEmit
node build.mjs
node dev.mjs
```

For the later Vite 5 line, change the consumer's Vite dependency in this temporary copy to `5.4.21`, reinstall, and repeat the three checks. For the Vite 8.3.0 regression, also change `@types/node` to `24.13.4` and TypeScript to `6.0.3`; the Node 18 types pinned here for the first business project cause a Vite 8 peer warning. The generated `dist/` must contain `index.html`, `manifest.webmanifest`, `sw.js`, and `pwa-recovery-worker.js`.

The browser and business plugin chain results for this revision are recorded in [verification.md](../../../../tasks/vite-adapter/verification.md). The source application has not been supplied, so the business plugin chain is represented by an isolated fixture and must be rerun in the actual application before release.
