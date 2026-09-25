// The deployed version, shown in the shell so an end-to-end test can tell one build from another.
//
// The update check builds this example twice, changing this string in between and restoring it afterwards. That
// changes the asset hash, so the injected precache manifest differs and the browser sees a genuinely new worker
// rather than a byte-identical one it would ignore.
export const APP_VERSION = "v1";
