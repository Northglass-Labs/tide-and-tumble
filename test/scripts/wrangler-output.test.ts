import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  activeVersionId,
  parseVersionUpload,
  previousVersionId,
  redact,
  workerDoesNotExist,
  workersDevOrigin,
} from "../../scripts/lib/wrangler-output.mjs";

describe("workersDevOrigin()", () => {
  it("is the Worker's own workers.dev address, as an origin", () => {
    expect(workersDevOrigin("https://tide-and-tumble.example.workers.dev", "tide-and-tumble")).toBe(
      "https://tide-and-tumble.example.workers.dev",
    );
    expect(workersDevOrigin("https://tide-and-tumble.example.workers.dev/", "tide-and-tumble")).toBe(
      "https://tide-and-tumble.example.workers.dev",
    );
  });

  it("is null for any other address, a path or a query included", () => {
    for (const address of [
      "https://other-app.example.workers.dev",
      "https://330292ad-tide-and-tumble.example.workers.dev",
      "http://tide-and-tumble.example.workers.dev",
      "https://tide-and-tumble.example.workers.dev/api/health",
      "https://tide-and-tumble.example.workers.dev/?x=1",
      "https://tide-and-tumble.example.workers.dev.evil.example",
      "https://user@tide-and-tumble.example.workers.dev",
      "https://tideandtumble.app",
      "--help",
      "not an address",
    ]) {
      expect(workersDevOrigin(address, "tide-and-tumble")).toBeNull();
    }
  });
});

describe("parseVersionUpload()", () => {
  it("yields the id and the address from the output of a real upload", () => {
    // Captured from `wrangler versions upload` (4.160.0) for this app; only
    // the local directory in the "Read 7 files" line was shortened.
    const output = readFileSync(new URL("./fixtures/versions-upload.txt", import.meta.url), "utf8");

    expect(parseVersionUpload(output)).toEqual({
      versionId: "330292ad-2848-4fde-9652-69b47e7dd78d",
      previewUrl: "https://330292ad-tide-and-tumble.example.workers.dev",
    });
  });

  it("yields null for the address when the output has none", () => {
    // What wrangler prints for a Worker whose version addresses are turned off.
    const output = [
      "Total Upload: 375.49 KiB / gzip: 87.69 KiB",
      "Uploaded tide-and-tumble (3.21 sec)",
      "Worker Version ID: 0b1d5e0c-7f0a-4b53-9d2e-5c1f4a6e8b90",
      "",
    ].join("\n");

    expect(parseVersionUpload(output)).toEqual({
      versionId: "0b1d5e0c-7f0a-4b53-9d2e-5c1f4a6e8b90",
      previewUrl: null,
    });
  });

  it("throws when there is no version id, rather than deploying a guess", () => {
    expect(() => parseVersionUpload("✘ [ERROR] Something went wrong.")).toThrow("version id");
  });
});

describe("workerDoesNotExist()", () => {
  it("recognises wrangler's answer for a Worker that was never deployed", () => {
    // Captured from `wrangler deployments status --json` before the first release.
    const output = [
      "✘ [ERROR] A request to the Cloudflare API (/accounts/0123456789abcdef0123456789abcdef/workers/scripts/tide-and-tumble/deployments) failed.",
      "",
      "  This Worker does not exist on your account. [code: 10007]",
    ].join("\n");

    expect(workerDoesNotExist(output)).toBe(true);
  });

  it("does not mistake other failures for it", () => {
    expect(workerDoesNotExist("✘ [ERROR] Authentication error [code: 10000]")).toBe(false);
    expect(workerDoesNotExist('{"id":"abc","versions":[]}')).toBe(false);
  });
});

// The shape `wrangler deployments status --json` and `deployments list --json` print.
function deployment(createdOn: string, versions: [string, number][]) {
  return {
    id: `deployment-${createdOn}`,
    source: "wrangler",
    strategy: "percentage",
    author_email: "someone@example.com",
    annotations: { "workers/triggered_by": "deployment" },
    versions: versions.map(([version_id, percentage]) => ({ version_id, percentage })),
    created_on: createdOn,
  };
}

describe("activeVersionId()", () => {
  it("is the version that has all the traffic", () => {
    expect(activeVersionId(deployment("2026-11-15T10:00:00Z", [["version-a", 100]]))).toBe("version-a");
  });

  it("is null while traffic is split, because no single version is live", () => {
    const split = deployment("2026-11-15T10:00:00Z", [
      ["version-a", 90],
      ["version-b", 10],
    ]);

    expect(activeVersionId(split)).toBeNull();
  });
});

describe("previousVersionId()", () => {
  const history = [
    deployment("2026-11-15T12:00:00Z", [["version-c", 100]]),
    deployment("2026-11-15T10:00:00Z", [["version-a", 100]]),
    deployment("2026-11-15T11:00:00Z", [["version-b", 100]]),
  ];

  it("is the version that was live before the current one", () => {
    expect(previousVersionId(history, "version-c")).toBe("version-b");
  });

  it("skips redeployments of the current version", () => {
    const redeployed = [...history, deployment("2026-11-15T13:00:00Z", [["version-c", 100]])];

    expect(previousVersionId(redeployed, "version-c")).toBe("version-b");
  });

  it("is the version before a rollback, so rolling back twice returns to where you were", () => {
    const rolledBack = [...history, deployment("2026-11-15T13:00:00Z", [["version-b", 100]])];

    expect(previousVersionId(rolledBack, "version-b")).toBe("version-c");
  });

  it("is null when nothing else was ever live", () => {
    expect(previousVersionId([deployment("2026-11-15T10:00:00Z", [["version-a", 100]])], "version-a")).toBeNull();
    expect(previousVersionId([], "version-a")).toBeNull();
  });
});


describe("redact()", () => {
  it("removes email addresses, account ids and the workers.dev subdomain, and keeps the rest", () => {
    const text = [
      "Getting User settings...",
      "👋 You are logged in with an OAuth Token, associated with the email someone@example.com.",
      "Account ID 0123456789abcdef0123456789abcdef",
      "Version Preview URL: https://330292ad-tide-and-tumble.example.workers.dev",
      "Worker Version ID: 330292ad-2848-4fde-9652-69b47e7dd78d",
    ].join("\n");

    const scrubbed = redact(text);
    expect(scrubbed).not.toContain("someone@example.com");
    expect(scrubbed).not.toContain("0123456789abcdef0123456789abcdef");
    expect(scrubbed).not.toContain(".example.workers.dev");
    expect(scrubbed).toContain("associated with the email [email].");
    expect(scrubbed).toContain("Account ID [account id]");
    expect(scrubbed).toContain("https://330292ad-tide-and-tumble.[subdomain].workers.dev");
    // A version id is a UUID, not an account id: it stays.
    expect(scrubbed).toContain("330292ad-2848-4fde-9652-69b47e7dd78d");
  });
});
