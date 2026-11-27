import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { ROOT, ROOT_PATH } from "./project.mjs";
import { redact } from "./wrangler-output.mjs";

/**
 * This project's own Wrangler, run with Node directly. Its package does not
 * export this file, so it is found by path rather than by `require`.
 */
export const WRANGLER_BIN = fileURLToPath(new URL("node_modules/wrangler/bin/wrangler.js", ROOT));

/**
 * @typedef {object} RunResult
 * @property {boolean} ok      Exited with status 0.
 * @property {string} stdout   Without colour codes.
 * @property {string} output   stdout and stderr together, without colour codes.
 */

/**
 * How long one Wrangler call may take. A call held up by the Cloudflare API
 * would otherwise spend the release job's whole time limit and say nothing.
 * After a hung call, promote's failure path can make up to three more, so
 * four calls can run into the limit: two minutes each keeps that within
 * deploy.yml's 25 minutes, with its message. Normal calls take seconds.
 */
export const WRANGLER_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * Runs a command in the repository root (or `cwd`) and waits for it.
 * Arguments are passed as a list, never through a shell, and output is
 * captured rather than shown: callers print one line per step and the details
 * only on failure. With `timeoutMs`, a command still running after that long
 * is stopped and reported as failed.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {{ timeoutMs?: number, cwd?: string }} [options]
 * @returns {RunResult}
 */
export function run(command, args, { timeoutMs, cwd = ROOT_PATH } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    maxBuffer: 64 * 1024 * 1024,
    ...(timeoutMs === undefined ? {} : { timeout: timeoutMs }),
  });
  // Colour codes start with the escape character.
  const plain = (/** @type {string | null} */ text) => (text ?? "").replace(/\u001b\[[0-9;]*m/g, "");
  const stdout = plain(result.stdout);
  const timedOut = /** @type {NodeJS.ErrnoException | undefined} */ (result.error)?.code === "ETIMEDOUT";
  const failure = timedOut
    ? `${command} did not finish within ${(timeoutMs ?? 0) / 1000} seconds and was stopped\n`
    : result.error
      ? `${result.error.message}\n`
      : "";
  return { ok: result.status === 0, stdout, output: `${failure}${stdout}${plain(result.stderr)}` };
}

/**
 * Runs this project's own Wrangler (the version in package.json), stopping it
 * after `timeoutMs`.
 *
 * @param {string[]} args
 * @param {number} [timeoutMs]
 * @returns {RunResult}
 */
export function wrangler(args, timeoutMs = WRANGLER_TIMEOUT_MS) {
  return run(process.execPath, [WRANGLER_BIN, ...args], { timeoutMs });
}

/**
 * The JSON a `--json` Wrangler command printed.
 *
 * @param {RunResult} result
 * @returns {unknown}
 */
export function jsonFrom(result) {
  const start = result.stdout.search(/[[{]/);
  if (start === -1) {
    throw new Error("Wrangler printed no JSON.");
  }
  return JSON.parse(result.stdout.slice(start));
}

/** A step of a delivery command that did not succeed. */
export class StepFailed extends Error {
  /**
   * @param {string} step What was being done, as a phrase.
   * @param {string} [details] Output to show, already safe to print.
   */
  constructor(step, details = "") {
    super(`Failed to ${step}.`);
    this.name = "StepFailed";
    this.details = details;
  }
}

/**
 * Returns the result of a step that succeeded; throws `StepFailed` with the
 * command's output (scrubbed by `redact`: this repository's Actions logs are
 * public) for one that did not.
 *
 * @param {string} step
 * @param {RunResult} result
 * @returns {RunResult}
 */
export function must(step, result) {
  if (!result.ok) {
    throw new StepFailed(step, redact(result.output.trim()));
  }
  return result;
}

/** Prints one progress line. Progress goes to stderr; stdout carries only the final JSON line. */
export function say(/** @type {string} */ line) {
  console.error(line);
}

/**
 * Runs a delivery command's `main`, printing a failed step's details and
 * setting a failing exit status instead of a stack trace.
 *
 * @param {() => Promise<void>} main
 */
export async function runMain(main) {
  try {
    await main();
  } catch (error) {
    if (error instanceof StepFailed) {
      if (error.details) {
        console.error(error.details);
      }
      console.error(error.message);
    } else {
      console.error(error instanceof Error ? error.message : String(error));
    }
    process.exitCode = 1;
  }
}
