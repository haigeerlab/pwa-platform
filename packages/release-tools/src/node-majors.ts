// ADR-0031's Node matrix. Lives in its own module (instead of on cli.ts, where it used to live) so both cli.ts
// (nvm discovery defaults) and run-gate.ts (the "which majors must run" refusal and verdict check) can import it
// without creating an import cycle between those two modules. cli.ts re-exports it so existing imports of
// `DEFAULT_NODE_MAJORS` from "./cli.js" keep working.
export const DEFAULT_NODE_MAJORS: readonly number[] = [22, 24];
