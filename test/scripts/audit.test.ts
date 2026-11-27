import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { judgeAudit, npmAuditArgs, parseAuditArgs, parseAuditReport, runAudit } from "../../scripts/lib/audit.mjs";

// Small synthetic `npm audit --json` reports: made-up packages and advisories.
const fixture = (name: string) => readFileSync(new URL(`fixtures/audit/${name}`, import.meta.url), "utf8");
const report = (name: string) => parseAuditReport(fixture(name));

const SAFE_CHAIN_NOTICE =
  "ℹ Safe-chain: Some package versions were suppressed during package metadata resolution due to minimum package age.\n";

describe("parseAuditReport()", () => {
  it("parses a report printed between notice lines", () => {
    const json = fixture("moderate.json");

    expect(parseAuditReport(`${SAFE_CHAIN_NOTICE}${json}\n`)).toEqual(JSON.parse(json));
  });

  it("refuses output with no report", () => {
    expect(() => parseAuditReport("")).toThrow("npm audit printed no report.");
    expect(() => parseAuditReport("npm error code ENOLOCK\nnpm error audit This command requires an existing lockfile.\n")).toThrow(
      "npm audit printed no report.",
    );
  });

  it("refuses npm's registry error", () => {
    const { summary } = (JSON.parse(fixture("registry-error.json")) as { error: { summary: string } }).error;

    expect(() => parseAuditReport(fixture("registry-error.json"))).toThrow(summary);
  });

  it("refuses npm's registry error when its summary is empty, as npm 11 prints it", () => {
    const { message } = JSON.parse(fixture("registry-error-npm11.json")) as { message: string };

    expect(() => parseAuditReport(fixture("registry-error-npm11.json"))).toThrow(message);
  });

  it("refuses JSON that is not a report, rather than reading it as no findings", () => {
    expect(() => parseAuditReport('{ "auditReportVersion": 2 }')).toThrow("npm audit printed something that is not a report.");
    expect(() => parseAuditReport("{ not json }")).toThrow("npm audit printed something that is not a report.");
    expect(() =>
      parseAuditReport('{ "vulnerabilities": { "example-glob": { "name": "example-glob", "severity": "unknown" } } }'),
    ).toThrow("npm audit printed something that is not a report.");
  });
});

describe("judgeAudit()", () => {
  const none = report("empty.json");

  it("blocks any production finding", () => {
    const moderate = report("moderate.json");

    expect(judgeAudit({ all: moderate, production: moderate }, { strict: false })).toEqual({
      ok: false,
      blocking: [{ name: "example-glob", severity: "moderate", production: true }],
      noted: [],
    });
  });

  it("blocks high and critical development findings", () => {
    expect(judgeAudit({ all: report("high-and-critical.json"), production: none }, { strict: false })).toEqual({
      ok: false,
      blocking: [
        { name: "example-bundler", severity: "high", production: false },
        { name: "example-runner", severity: "critical", production: false },
      ],
      noted: [],
    });
  });

  it("notes moderate development findings without blocking", () => {
    expect(judgeAudit({ all: report("moderate.json"), production: none }, { strict: false })).toEqual({
      ok: true,
      blocking: [],
      noted: [{ name: "example-glob", severity: "moderate", production: false }],
    });
  });

  it("notes low and info development findings too", () => {
    expect(judgeAudit({ all: report("low-and-info.json"), production: none }, { strict: false })).toEqual({
      ok: true,
      blocking: [],
      noted: [
        { name: "example-banner", severity: "info", production: false },
        { name: "example-colors", severity: "low", production: false },
      ],
    });
  });

  it("passes an empty report", () => {
    expect(judgeAudit({ all: none, production: none }, { strict: false })).toEqual({ ok: true, blocking: [], noted: [] });
  });

  it("blocks everything in strict mode", () => {
    expect(judgeAudit({ all: report("moderate.json"), production: none }, { strict: true })).toEqual({
      ok: false,
      blocking: [{ name: "example-glob", severity: "moderate", production: false }],
      noted: [],
    });
  });
});

describe("runAudit()", () => {
  it("asks npm for the full and the production report", () => {
    const asked: boolean[] = [];
    const result = runAudit(
      { strict: false },
      {
        npmAudit: (omitDev: boolean) => {
          asked.push(omitDev);
          return fixture(omitDev ? "empty.json" : "moderate.json");
        },
      },
    );

    expect(asked).toEqual([false, true]);
    expect(result).toEqual({ ok: true, blocking: [], noted: [{ name: "example-glob", severity: "moderate", production: false }] });
  });

  it("fails, never passes, when npm cannot reach the registry", () => {
    expect(() => runAudit({ strict: false }, { npmAudit: () => fixture("registry-error.json") })).toThrow("ENOTFOUND");
  });
});

describe("npmAuditArgs()", () => {
  it("makes npm ask the registry about every dependency, whatever its configuration says", () => {
    // Under npm_config_offline=true npm reports nothing, and under NODE_ENV=production (or an `omit` setting) it
    // leaves dependencies out: the check would pass on no information.
    expect(npmAuditArgs(false)).toEqual([
      "audit",
      "--json",
      "--no-offline",
      "--include=dev",
      "--include=optional",
      "--include=peer",
    ]);
    expect(npmAuditArgs(true)).toEqual([
      "audit",
      "--json",
      "--no-offline",
      "--omit=dev",
      "--include=optional",
      "--include=peer",
    ]);
  });
});

describe("parseAuditArgs()", () => {
  it("takes --strict and nothing else", () => {
    expect(parseAuditArgs([])).toEqual({ strict: false });
    expect(parseAuditArgs(["--strict"])).toEqual({ strict: true });
    expect(() => parseAuditArgs(["--strictly"])).toThrow("Usage: npm run audit [-- --strict]");
    expect(() => parseAuditArgs(["--strict", "extra"])).toThrow("Usage: npm run audit [-- --strict]");
  });
});
