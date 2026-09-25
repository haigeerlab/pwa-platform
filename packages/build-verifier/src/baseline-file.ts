// The one module in this package that touches the file system. Everything else is a pure function, which is what
// lets a release check run without a disk; the import-safety test keeps `node:*` confined to this file.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Slot names are kebab-case, the same shape as a module id, so a path can never be built from a stray value. */
const SLOT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type PwaBaselineLocation = {
  /** Directory holding one JSON file per deployment slot, version-controlled with the app (ADR-0008). */
  readonly directory: string;
  readonly slot: string;
};

/**
 * Reads a slot's stored baseline as unchecked JSON. Validation belongs to `compareIdentityBaseline`, so a file
 * that parses but is not an identity produces a diagnostic rather than an exception.
 *
 * Throws when the slot name is malformed, the file is absent, or its contents are not JSON. A missing baseline is
 * deliberately an exception and not a return value: whether it means "first production release" or "the gate
 * fails" is a decision the release process makes with a human review (ADR-0004), not one this function can infer.
 */
export function readIdentityBaseline(location: PwaBaselineLocation): unknown {
  if (!SLOT.test(location.slot)) {
    throw new TypeError("A deployment slot name must be lower-case kebab-case");
  }

  const file = join(location.directory, `${location.slot}.json`);

  // Only "the file is not there" means the slot may never have been released. A permissions fault, or a directory
  // standing where the file belongs, is an infrastructure failure; reporting it as an absent baseline would route
  // it into the first-production-release review (ADR-0004), where a broken mount could be approved as a brand-new
  // slot. Existence is tested before reading rather than sorted out from the caught error, because attaching that
  // error as a `cause` would put the path back into anything that logs the failure — the very thing these
  // constant messages exist to prevent. A file removed between the two calls lands in the second branch, which is
  // the safe direction: a real fault is never mistaken for "never released".
  if (!existsSync(file)) {
    throw new Error("No release baseline is stored for this deployment slot");
  }

  let contents: string;
  try {
    contents = readFileSync(file, "utf8");
  } catch {
    throw new Error("The release baseline could not be read");
  }

  try {
    return JSON.parse(contents) as unknown;
  } catch {
    throw new Error("The stored release baseline is not valid JSON");
  }
}
