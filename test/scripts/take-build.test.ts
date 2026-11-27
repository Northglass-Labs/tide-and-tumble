import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { RECORD, takeBuild } from "../../scripts/lib/take-build.mjs";
import { StepFailed } from "../../scripts/lib/run.mjs";

/** A folder holding these files, as download-artifact leaves the build. */
function artifact(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "tnt-artifact-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

const build = {
  "out/index.html": "<p>tides</p>",
  "out/.assetsignore": ".*\n",
  "out/_next/static/chunks/a.js": "x",
  [RECORD]: '{"commit":"c","tag":"t","digest":"d"}',
};

const refusal = (attempt: () => unknown): StepFailed => {
  try {
    attempt();
  } catch (error) {
    if (error instanceof StepFailed) return error;
    throw error;
  }
  throw new Error("expected takeBuild to refuse");
};

describe("takeBuild()", () => {
  it("takes the regular files under out/ and the one record into the workspace", () => {
    const from = artifact(build);
    const root = mkdtempSync(join(tmpdir(), "tnt-workspace-"));
    expect(takeBuild(from, root)).toBe(4);
    expect(readFileSync(join(root, "out/_next/static/chunks/a.js"), "utf8")).toBe("x");
    expect(readFileSync(join(root, RECORD), "utf8")).toContain('"commit":"c"');
  });

  it("takes nothing when the artifact holds any other path, such as a package or a script the release runs", () => {
    for (const extra of ["node_modules/wrangler/bin/wrangler.js", "scripts/lib/run.mjs", "node_modules/.cache/other.json", "package.json"]) {
      const from = artifact({ ...build, [extra]: "planted" });
      const root = mkdtempSync(join(tmpdir(), "tnt-workspace-"));
      const error = refusal(() => takeBuild(from, root));
      expect(error.details).toContain(extra);
      expect(existsSync(join(root, "out"))).toBe(false);
      expect(existsSync(join(root, extra))).toBe(false);
    }
  });

  it("takes nothing when the artifact holds a symbolic link, inside out/ or as out/ itself", () => {
    const from = artifact(build);
    symlinkSync("/etc/hosts", join(from, "out", "hosts"));
    expect(refusal(() => takeBuild(from, mkdtempSync(join(tmpdir(), "tnt-workspace-")))).details).toContain("out/hosts");

    const linked = artifact({ [RECORD]: "{}" });
    symlinkSync(mkdtempSync(join(tmpdir(), "tnt-elsewhere-")), join(linked, "out"));
    expect(refusal(() => takeBuild(linked, mkdtempSync(join(tmpdir(), "tnt-workspace-")))).details).toContain("out");
  });

  it("refuses an artifact without the record or without out/, and a workspace that has an out/ already", () => {
    const root = () => mkdtempSync(join(tmpdir(), "tnt-workspace-"));
    expect(refusal(() => takeBuild(artifact({ "out/index.html": "" }), root())).details).toContain(RECORD);
    expect(refusal(() => takeBuild(artifact({ [RECORD]: "{}" }), root())).details).toContain("out/");
    const busy = root();
    mkdirSync(join(busy, "out"));
    expect(refusal(() => takeBuild(artifact(build), busy)).message).toContain("out/ exists");
  });
});
