# @pwa-platform/sw-runtime

Service worker and recovery runtime for PWA Platform.

Internal platform service worker and recovery worker implementation. Applications should not register its entries directly.

The `0.1.0` release provides online use, installation integration, static precaching, a safe offline fallback, and controlled updates. It does not enable runtime business API caching, private data caching, automatic write replay, or Push for applications. Production deployment requires the application and infrastructure checks described in the PWA Platform release runbook.

License: MIT.
