// The `localStorage` key that carries the app's theme preference — spec/pwa-entry-resilience.md's "跟随宿主应用的
// 主题设置": "公开契约是这个键，不是 setPwaTheme 这个函数". Shared by src/client/index.ts (`setPwaTheme` writes it)
// and src/page/main.ts (the recovery page reads it before its first render), which must agree on the same key for
// one app/environment — kept here, rather than duplicated in both, so that agreement cannot drift.
//
// Same segment-encoding as src/browser/indexeddb.ts's database name (`pwa-entry:<appId>:<environment>`), but under
// the unrelated `pwa:theme:` prefix the spec pins character for character, since this is a different storage
// mechanism (`localStorage`, not IndexedDB) that the recovery page must be able to read without depending on any
// other part of this package's browser adapters.
export function themeStorageKey(appId: string, environment: string): string {
  return `pwa:theme:${encodeURIComponent(appId)}:${encodeURIComponent(environment)}`;
}
