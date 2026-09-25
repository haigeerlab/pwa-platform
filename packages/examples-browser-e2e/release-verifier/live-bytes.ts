// The gate before this tool will write anything at all: does the live site actually serve the candidate build?
// (module spec, "采集输入": "候选 build.json 的文件哈希必须与线上字节一致，否则说明线上不是这个候选，工具拒绝出
// 报告".) Every published path except `_headers` (which is never itself served) is fetched and hashed; a single
// mismatch, wrong status, cross-origin redirect, timeout, or unreachable path refuses the whole run. Only a
// same-origin "pretty URL" redirect (Cloudflare Pages turning `/app/index.html` into `/app/`) is followed.
import { fetchFollowingRedirects, DEFAULT_REQUEST_TIMEOUT_MS } from "./fetch-utils.ts";

export type PwaLiveBytesMismatch = {
  readonly path: string;
  readonly expectedSha256: string;
  readonly actualSha256: string | null;
  readonly reason: string;
};

export type PwaLiveBytesResult = { readonly ok: boolean; readonly mismatches: readonly PwaLiveBytesMismatch[] };

export async function verifyLiveBytes(
  origin: string,
  files: Readonly<Record<string, string>>,
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<PwaLiveBytesResult> {
  const mismatches: PwaLiveBytesMismatch[] = [];

  for (const [path, expectedSha256] of Object.entries(files)) {
    if (path === "_headers") continue;
    const outcome = await fetchFollowingRedirects(`${origin}/${path}`, timeoutMs);
    if (!outcome.ok) {
      mismatches.push({ path, expectedSha256, actualSha256: null, reason: outcome.reason });
      continue;
    }
    if (outcome.value.bodySha256 !== expectedSha256) {
      mismatches.push({ path, expectedSha256, actualSha256: outcome.value.bodySha256, reason: "body does not match build.json" });
    }
  }

  return { ok: mismatches.length === 0, mismatches };
}
