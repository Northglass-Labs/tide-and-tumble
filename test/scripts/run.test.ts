import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  jsonFrom,
  must,
  run,
  runMain,
  say,
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

describe("what the delivery scripts print", () => {
  // The scripts are run with --origin naming the Worker's workers.dev address, which carries the account's
  // subdomain, and Actions logs are public: progress lines and failures are scrubbed like Wrangler's output.
  const ADDRESS = "https://tide-and-tumble.example.workers.dev";

  it("scrubs the workers.dev subdomain and email addresses from progress lines", () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((line: string) => {
      lines.push(line);
    });
    try {
      say(`promote: checking ${ADDRESS} for someone@example.org`);
    } finally {
      spy.mockRestore();
    }
    expect(lines).toEqual(["promote: checking https://tide-and-tumble.[subdomain].workers.dev for [email]"]);
  });

  it("scrubs a failed step's message and details, and any other error", async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((line: string) => {
      lines.push(line);
    });
    const before = process.exitCode;
    try {
      await runMain(() => Promise.reject(new StepFailed(`check ${ADDRESS}`, `GET ${ADDRESS}/api/health answered 500`)));
      await runMain(() => Promise.reject(new Error(`Usage: --origin ${ADDRESS}`)));
    } finally {
      spy.mockRestore();
      process.exitCode = before;
    }
    expect(lines.join("\n")).not.toContain(".example.workers.dev");
    expect(lines.join("\n")).toContain("tide-and-tumble.[subdomain].workers.dev");
    expect(lines).toHaveLength(3);
  });
});

