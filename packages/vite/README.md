# @pwa-platform/vite

Vite build integration for PWA Platform.

Add the `pwa()` plugin to the Vite configuration. Pair it with the Vue or React binding in the application.

The `0.1.0` release accepts Vite 5 and 8 on Node 22 or later.

Add `@pwa-platform/vite/virtual` to the application's `tsconfig.json` `compilerOptions.types` to type `virtual:pwa-config`. The plugin resolves this virtual module in `vite dev`, but only a production build emits a worker and precache. Call the client binding's `register()` only in production, and use `vite build` plus a served build to test offline behavior. Keep `pwa()` after any plugin that changes final JS or CSS bytes: the build fails if a later plugin changes files after the PWA plan is compiled. Obfuscators must also produce identical bytes for identical input; configure a fixed seed and compare two clean builds. A changing file behind an unchanged fingerprinted URL is unsafe to publish.

The `0.1.0` release provides online use, installation integration, static precaching, a safe offline fallback, and controlled updates. It does not enable runtime business API caching, private data caching, automatic write replay, or Push for applications. Production deployment requires the application and infrastructure checks described in the PWA Platform release runbook.

License: MIT.
