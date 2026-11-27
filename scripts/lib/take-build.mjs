import { constants, copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { StepFailed } from "./run.mjs";

/**
 * Taking the build into the release job's workspace. The build job's runner
 * chose what is in the artifact, and it ran every package's code, so the
 * release job takes from it only what a build makes: regular files under
 * out/ and the one record prepare-release writes. A link, any other path (a
 * package under node_modules, a script the release runs) or a missing part
 * refuses the whole artifact, and nothing is taken.
 */

/** The record prepare-release writes, and promote reads. */
export const RECORD = "node_modules/.cache/tide-and-tumble-release.json";

/**
 * The files of a downloaded build that may enter the workspace, and what is
 * wrong with the rest. Directory entries are read without following links.
 *
 * @param {string} dir
 * @returns {{ files: string[], problems: string[] }}
 */
export function buildFiles(dir) {
  /** @type {string[]} */
  const files = [];
  /** @type {string[]} */
  const problems = [];
  /** @param {string} relative */
  const walk = (relative) => {
    for (const entry of readdirSync(join(dir, relative), { withFileTypes: true })) {
      const path = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (entry.name === "." || entry.name === ".." || entry.name.includes("\\")) {
        problems.push(`${path} (not a plain name)`);
      } else if (entry.isSymbolicLink()) {
        problems.push(`${path} (a symbolic link)`);
      } else if (entry.isDirectory()) {
        // Every folder is read, so each stray file is named.
        walk(path);
      } else if (!entry.isFile()) {
        problems.push(`${path} (not a regular file)`);
      } else if (path.startsWith("out/") || path === RECORD) {
        files.push(path);
      } else {
        problems.push(`${path} (not part of a build)`);
      }
    }
  };
  walk("");
  if (!files.includes(RECORD)) problems.push(`${RECORD} is missing`);
  if (!files.some((file) => file.startsWith("out/"))) problems.push("out/ is missing or empty");
  return { files, problems };
}

/**
 * Copies the build's files from `from` into `root`, refusing the whole
 * artifact when it holds anything else (`buildFiles`). Nothing is overwritten.
 *
 * @param {string} from Where download-artifact put the build: an empty folder of its own.
 * @param {string} root The workspace.
 * @returns {number} How many files were taken.
 */
export function takeBuild(from, root) {
  const { files, problems } = buildFiles(from);
  if (problems.length > 0) {
    throw new StepFailed(
      "take the build: the artifact holds what a build never makes, so nothing was taken",
      problems.join("\n"),
    );
  }
  if (existsSync(join(root, "out"))) {
    throw new StepFailed("take the build: out/ exists in this workspace already, so nothing was taken");
  }
  for (const file of files) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    copyFileSync(join(from, file), join(root, file), constants.COPYFILE_EXCL);
  }
  return files.length;
}
