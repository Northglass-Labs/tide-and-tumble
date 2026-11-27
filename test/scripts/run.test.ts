import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  jsonFrom,
  must,
  run,
  StepFailed,
  wrangler,
  WRANGLER_BIN,
  WRANGLER_TIMEOUT_MS,
} from "../../scripts/lib/run.mjs";

describe("the tools the delivery scripts run", () => {
  it("are where the scripts look for them", () => {
    // A dependency upgrade that moves the file should fail here, not in a release.
    expect(existsSync(WRANGLER_BIN)).toBe(true);
  });
});

describe("run()", () => {
  it("captures what a command prints and whether it succeeded", () => {
    const result = run(process.execPath, ["-e", "console.log('out'); console.error('err')"]);

    expect(result.ok).toBe(true);
    expect(result.stdout).toBe("out\n");
    expect(result.output).toContain("out");
    expect(result.output).toContain("err");
  });

  it("removes colour codes", () => {
    const result = run(process.execPath, ["-e", "console.log('\\u001b[31mred\\u001b[0m')"]);

    expect(result.stdout).toBe("red\n");
  });

  it("reports a failing command and one that cannot be started", () => {
    expect(run(process.execPath, ["-e", "process.exit(3)"]).ok).toBe(false);

    const missing = run("no-such-command-anywhere", []);

    expect(missing.ok).toBe(false);
    expect(missing.output).toContain("no-such-command-anywhere");
  });
});

describe("must()", () => {
  it("passes a successful result through", () => {
    const result = { ok: true, stdout: "fine", output: "fine" };

    expect(must("do it", result)).toBe(result);
  });

  it("throws the step and the output, with email addresses removed", () => {
    const result = { ok: false, stdout: "", output: "Author: person@example.com\nboom\n" };

    let thrown: unknown;
    try {
      must("upload the new version", result);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(StepFailed);
    expect((thrown as StepFailed).message).toBe("Failed to upload the new version.");
    expect((thrown as StepFailed).details).toBe("Author: [email]\nboom");
  });
});

describe("jsonFrom()", () => {
  it("finds the JSON after anything Wrangler prints before it", () => {
    expect(jsonFrom({ ok: true, stdout: 'A notice.\n{"id":"abc"}\n', output: "" })).toEqual({ id: "abc" });
    expect(jsonFrom({ ok: true, stdout: "[1,2]", output: "" })).toEqual([1, 2]);
  });

  it("throws when there is none", () => {
    expect(() => jsonFrom({ ok: true, stdout: "nothing here", output: "" })).toThrow("no JSON");
  });
});

describe("a command that never finishes", () => {
  it("is stopped after its time limit, and reported as a failure that says so", () => {
    const started = performance.now();

    const result = run(process.execPath, ["-e", "setTimeout(() => {}, 60_000)"], { timeoutMs: 300 });

    expect(performance.now() - started).toBeLessThan(10_000);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("did not finish within 0.3 seconds and was stopped");
  });

  it("is a Wrangler call held up by the Cloudflare API: each one gets two minutes", () => {
    // A release job that hangs on one call would otherwise spend its whole time limit and say nothing. After a hung
    // call, promote's failure path can make up to three more (read production, roll back, read again), so four calls
    // can run into the limit: 8 minutes at two each, which fits deploy.yml's 25 after install, verify, audit and the
    // checks; at five each (20) it would not. Normal calls take seconds.
    expect(WRANGLER_TIMEOUT_MS).toBe(2 * 60 * 1000);

    const result = wrangler(["--version"], 1);

    expect(result.ok).toBe(false);
    expect(result.output).toContain("did not finish within");
  });
});
