# Vue 3.4 + Vite 5 update notice consumer

This is an isolated consumer of the **packed** Vue package. It does not import workspace source or register a service worker; worker integration is verified separately by the Vite fixture and browser examples.

After `pnpm --filter @pwa-platform/vue build`, run from the repository root:

```sh
fixture_dir="$(mktemp -d)"
cp -R packages/vue/compatibility/vue34-vite5-update-notice/. "$fixture_dir/"
pnpm --filter @pwa-platform/vue pack --pack-destination "$fixture_dir"
mv "$fixture_dir"/pwa-platform-vue-*.tgz "$fixture_dir/adapter.tgz"
cd "$fixture_dir"
corepack pnpm@8.6.5 install --ignore-scripts
corepack pnpm@8.6.5 run typecheck
corepack pnpm@8.6.5 run build
```

Run those commands under Node 22. The consumer pins Vue 3.4.0, Vite 5.0.0, TypeScript 5.2.2 and pnpm 8.6.5. Its `main.ts` exercises the typed `colors` prop. The package tarball must contain `dist/ui.js`, `dist/ui.d.ts` and `dist/update-notice.css`; the build must emit both JS and CSS.
