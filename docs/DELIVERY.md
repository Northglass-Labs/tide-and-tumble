# Delivery

How Tide & Tumble is checked, released and rolled back, what the free plan
allows, and how contributions reach production. The commands and their
logic come from the Northglass app template; the differences for this app are
in `docs/specs/2026-11-27-workers-hosting.md` ("Release").

This file is public. Accounts, identifiers, DNS, the zone's settings, how the
release credentials are made and kept, and the operator's cutover and
hosting-rollback steps are kept in the private operations record.

## The commands

| Command | What it does | What a pass proves |
|---|---|---|
| `npm run verify` | `typecheck`, `lint`, `test`, `build`, `check` | The code type-checks and lints, every test passes, the site exports, and the export can be uploaded |
| `npm run audit [-- --strict]` | Asks npm for known vulnerabilities in the dependencies (needs the network) | No production dependency and no high or critical development tool has a known advisory; with `--strict`, no dependency has any |
| `npm run build` | `next build`: the static export in `out/` | The site can be built from this commit |
| `npm run check` | Holds `out/` to what may be uploaded | No dotfile, key or link; the files the checks need are there; every page the sitemap names was exported; within the free plan's file limits |
| `npm run preview` | Builds, then serves the export and the Worker on `localhost:4183` in the Workers runtime | What will be deployed can be tried locally, with the real headers, routing and upstreams |
| `node scripts/prepare-release.mjs` | Builds and checks a clean copy of main's commit with no Cloudflare credential in reach, and records it for `promote` (steps below) | `out/` is exactly the verified build of this commit |
| `npm run promote [-- --origin <address>]` | Releases what `prepare-release` built (steps below) | Production is serving this commit and is healthy; otherwise it is back on the previous version |
| `npm run health -- <url>` | Checks a running site | The API is up, the expected version answers, the page is this app's with its security headers, an unknown path is a 404, the data API answers a known station, and the API is fast enough |
| `npm run rollback -- [versionId] [--origin <address>]` | Sends all traffic back to an earlier version | Production is serving that version and is healthy |

`audit`, `health`, `promote` and `rollback` print one JSON line per check
on stdout and exit 1 on failure; progress goes to stderr. What they print is
scrubbed of email addresses, account ids and the `workers.dev` subdomain,
because this repository's Actions logs are public.

### `npm run verify`

Runs the five checks in order and stops at the first failure. `typecheck`
covers the app (`tsconfig.json`), the Worker (`tsconfig.worker.json`, with
the types `wrangler types` generates) and the scripts (`tsconfig.node.json`).
The build calls NOAA once per beach page for its tide table (three tries
each); a beach NOAA cannot answer for gets the "temporarily unavailable" note
and the browser fills the table in.

There is no size or Lighthouse budget yet (the template's `budget`); it is
listed in the design note under "Not in this change".

### `npm run audit [-- --strict]`

Runs `npm audit --json` for all dependencies and again for production ones
only (`--omit=dev`), and prints one JSON line: `ok`, `blocking` and `noted`.
It exits 1 when anything blocks:

- any advisory in a production dependency;
- a high or critical advisory in a development tool;
- with `--strict`, any advisory at all (the daily check).

Moderate, low and info advisories in development tools are listed under
`noted` without failing, because a gate on them can block every pull
request, the fix included; the daily strict check still reports them. It
never passes on no information: it tells npm to ask the registry and which
dependencies to look at, and fails with npm's reason when there is no report.

### `npm run health -- <baseUrl> [--expect-tag <sha>] [--samples 20] [--p95-ms 300]`

1. `GET /api/health` answers 200 with `ok: true`.
2. With `--expect-tag`, the version answering has that git tag
   (`--expect-version <id>` expects a Worker version id instead).
3. `GET /` answers 200, is this app's page, and carries its
   Content-Security-Policy and HSTS headers (from `public/_headers`).
4. `GET /health-check-not-a-page` answers 404.
5. `GET /api/tides?station=8651370`, asked as the site's own pages ask it,
   answers a tide table, or 502
   `upstream_unavailable` (NOAA did not answer the Worker, which is not the
   release's fault); anything else fails. At the `workers.dev` address, where
   the data routes never answer, it must be their 404.
6. The 95th percentile of 20 timed requests to `/api/health` is under the
   limit: one slow outlier is forgiven, two are not.

`--built-within-days <n>` also asks one beach page for its build date
(`<meta name="tide-table-built">`, which `npm run check` requires on every
beach page) and fails when it is older than `n` days.

`--wait-ms <ms>` keeps retrying the first check while a release reaches every
Cloudflare location. A check that Cloudflare's bot protection answers with a
challenge (`cf-mitigated: challenge`) is reported as `"blocked": true`: it
fails, but says nothing about the site's health, and it is not retried.

`/api/health` asks no upstream, and the data check accepts NOAA's outage
passed on: NOAA being down is never a reason to roll a release back.

### `node scripts/prepare-release.mjs`

The build runs project and dependency code, so it runs before, and apart
from, anything that holds the Cloudflare token:

1. Refuses to run while a Cloudflare token or key is in its environment. A
   saved Wrangler sign-in on the machine is a file the build could still
   read, so run `npx wrangler logout` before a workstation release, and give
   the token to `promote` alone.
2. Refuses a working tree with uncommitted changes or with files git does
   not fully see (marked assume-unchanged or skip-worktree), and a commit
   that is not main's: on a workstation it fetches GitHub's `main` and needs
   `HEAD` to be it; on GitHub Actions it needs the commit the run is for, on
   `refs/heads/main`. Refuses a commit holding symbolic links.
3. Removes `out/`, makes a clean copy of the commit (a detached worktree in a
   temporary folder), and there runs `npm ci --ignore-scripts` and
   `npm run verify`; no package's install script runs, and nothing in the
   working tree but the commit (an ignored file, an old `out/`) can reach the
   build.
4. Refuses a build with a dotfile, a key-like file or a symbolic link in
   `out/` (`public/.assetsignore` keeps them out of the upload too), copies
   that `out/` here, removes the clean copy, and checks the copy is the same.
5. Runs `npm ci --ignore-scripts` here for the Wrangler `promote` runs, and
   records the commit and a digest of `out/` under `node_modules/.cache/`.

### `npm run promote [-- --origin <address>]`

`promote` holds the token and runs no build and no npm: Wrangler is the only
package code it runs.

1. Refuses what `prepare-release` refuses in step 2, and a commit
   `prepare-release` did not record, or an `out/` whose digest changed since.
2. On a scheduled run (the nightly refresh), releases nothing unless
   production runs this commit already, and nothing whose build lacks a
   beach page's tide table; it says why ([The nightly
   release](#releasing-from-github)).
3. Reads the live version, then confirms the address it will check
   (["Where production is checked"](#where-production-is-checked)) before
   anything changes.
4. Uploads a new Worker version, with the export, tagged with the
   12-character commit. If Wrangler names an address for it, Version URLs are
   on in Cloudflare although `wrangler.jsonc` turns them off: it stops, and
   production is unchanged. It stops too if `out/` changed during the upload.
5. Reads production again and, if it changed since step 3 (another release
   is under way), stops; otherwise sends all traffic to the new version.
6. Checks production (`health`), expecting the new version and the commit's
   tag, waiting up to 90 seconds for the release to arrive; if it fails,
   checks once more.
7. If it fails again, rolls back to the version that was live before and
   exits 1, but only while production is still on this release's version.
   A blocked check never causes a rollback: it stops and prints the commands
   to check the new version and to go back.

Version URLs are off (the design note, "Decisions", D3), so production is a new version's first
check: a broken build can serve for up to about three minutes before its
rollback lands.

Each Wrangler call is stopped after two minutes and each request a check
makes after ten seconds, so a stalled API fails the release with the step
named. Every Wrangler call passes `--config wrangler.jsonc`; `promote` and
`rollback` refuse to run while a `wrangler.json` or `wrangler.toml` exists in
the repository or above it. When Wrangler reports a failed deploy, `promote`
asks what is live rather than assume, and says plainly when a version "may be
live and unchecked", with the commands to check it and to go back.

The **first release** is different: Wrangler cannot upload a version of a
Worker that does not exist, so it is one `wrangler deploy`, checked at the
Worker's `workers.dev` address, which must be named with `--origin`.

`promote` never changes routes, custom domains or DNS, and `wrangler.jsonc`
declares none (a test refuses them).

### Where production is checked

By default at `https://tideandtumble.app`, but only after `promote` has seen
that address answer with the live version, which shows the zone route is
attached and this account serves it. If it answers anything else (the
previous host before the cutover or after a hosting rollback, or nothing
because production is down), `promote` refuses before changing anything.

Then name the Worker's own address: `--origin
https://tide-and-tumble.<account subdomain>.workers.dev`. There the version it
answers with must be one Wrangler can find for this Worker, which it only
can in the right account; when it cannot say (the Worker is down), the
release goes on, since a fix must stay releasable and production's own check
after it would fail in another account. The subdomain is never written into
this repository; the person releasing knows it.

## Rolling back

**Code and pages.** `npm run rollback` sends all traffic back to the newest
version of an earlier commit than the live one, past the live commit's
nightly refreshes (marked "Nightly refresh:"); `npm run rollback -- <versionId>` to a
named one (`npx wrangler versions list --config wrangler.jsonc`). Each
version carries the static export it was uploaded with, so the pages go back
too. It confirms the address first, as `promote` does, then checks the
rollback. When the address answers with another version, it refuses and
prints the commands to roll back by hand once `npx wrangler whoami` shows the
right account. When it cannot say which version answers (a release that
broke `/api/health`, which is what a rollback is for), it rolls back the live
version Wrangler reads, with a warning. A rollback is itself a deployment: running it twice returns to
where you started. Without a version it looks only at the 10 most recent
deployments, which is all `wrangler deployments list` returns: about a week
of nightly refreshes. To go further back, name the version: `npx wrangler
versions list --config wrangler.jsonc` shows the 10 most recent versions and
the dashboard more. Cloudflare keeps the 100 most recent versions; with the
nightly release that is about three months.

There is no data to roll back: the API keeps nothing but caches of public
data, which expire within 75 minutes.

**A bad commit is fixed by a revert on `main`.** A rollback puts an earlier
version live, but `main` still holds the bad commit, and the next push to
`main`, a Dependabot merge or Deploy run by hand, releases it again. The
nightly run never does: it changes nothing while production runs another
commit than `main`'s head, and says so. The daily check fails until
production runs `main`'s head again. So after rolling back, revert the bad
commit on `main` (`git revert`, through a pull request); its release puts
production on `main`'s head again.

**Hosting.** Going back to the previous host is the operator's; the steps are
in the private operations record. That host's Git deployments are off: the
root `vercel.json` sets `git.deploymentEnabled` to false, which it reads from
each pushed commit, so no push or merge deploys there; its last production
deployment stays as the hosting rollback, and removing the file would turn
them on again.

## What the free plan allows

Read from Cloudflare's documentation on November 27, 2026. All Workers in
the account share the Workers limits.

| | Free allowance |
|---|---|
| Static files | Unlimited requests at no cost; 20,000 files per version, 25 MiB each; 100 `_headers` rules |
| Worker requests | 100,000 a day for the whole account, reset at midnight UTC |
| Worker CPU | 10 ms per request |
| Subrequests | 50 per request |
| Worker logs | 200,000 log events a day, kept 3 days (moving to new pricing on December 1, 2026) |

How the app stays inside them:

- Pages, scripts, images and unknown paths are static files: only `/api/*`
  runs the Worker (checked in `wrangler dev`; the export holds 586 files).
- A beach view makes three Worker requests: tides, marine, alerts. Caches per
  station keep NOAA, NDBC and NWS calls to one per station per cache period per
  Cloudflare location.
- The heaviest handler work measured is parsing the 300 KB station list once
  per Worker instance (1.3 ms) and a buoy file's newest row, the only part
  read. `marine` makes at most 10 subrequests (up to eight NDBC stations, two
  at the tide gauge), `alerts` 4, `tides` 1, plus a cache read and write.
- Per-client limits slow a noisy client (60 tide, 30 marine, 30 alert
  requests a minute, an IPv6 client counted by its /64); a request for an
  unknown station is refused before it counts, and the per-instance cap
  counts only requests that would ask NOAA, NDBC or NWS, not answers from the
  cache. Every request that reaches the Worker still counts against the
  daily allowance, refused or not. Only rules on the zone can
  keep requests from reaching it, and those are the operator's. A patient
  client can still spend the account's allowance, here as through any public
  Worker.
- When the daily allowance is spent, Cloudflare answers `/api/*` with an
  error until midnight UTC (429, or its 1027 page), and the app shows its
  "unavailable" states. Cloudflare's documentation says static files are
  free and unlimited, but does not say outright what a route does with page
  requests once the account's allowance is spent; that is the route's fail
  mode, which the operator sets.
- Invocation logs are off, so a request is not logged; the Worker logs only
  fixed failure labels.
- Workers Cache (`"cache"` in `wrangler.jsonc`) is refused: it would count every
  static file against the daily limit.

## Releasing from GitHub

Three workflows, as in the app template. Each asks for read access to the
repository and no more, except the merge job. Actions are pinned to a commit
with the version in a comment.

**Every pull request and every push to `main` (`ci.yml`).** `npm ci --ignore-scripts`,
`npm run verify`, `npm run audit`. Its second job, `merge-dependabot`, merges a
passing patch or minor npm update that Dependabot opened and pushed, once
releases are automatic, and starts the release with a dispatch (a merge made
with a workflow's token starts no push workflow). Majors, Actions updates, a
minor update below 1.0, an update whose maintainers changed, or one whose
description was cut short wait for review; the run's summary says why.

**The release (`deploy.yml`).** On a push to `main`, a dispatch, and every
night at 08:17 UTC, in three jobs, each on a fresh runner. `gate` checks that
the token is set and that the run is for `main`'s head (a run for an older
commit builds and releases nothing). `build`, with no secret, runs
`npm run audit` and `node scripts/prepare-release.mjs` and keeps `out/` and
its record as an artifact. `release` checks out the same commit, installs
with `npm ci --ignore-scripts` and no npm cache, downloads the build into an
empty folder of its own and takes from it only regular files under `out/`
and the one record (`node scripts/take-build.mjs`: a link, a package, a
script or any other path refuses the whole artifact), checks `main`'s head
again (a re-run of a failed release job reuses the gate's answer), and runs
`node scripts/promote.mjs`, the only step that sees the token; promote
re-checks that the record names this commit and that `out/` still has its
digest, and bundles the Worker from this checkout, so the artifact can only
carry static files. Its `Released` step runs only when a version was
released. Releases queue one at a time and are never cancelled halfway.
Without the secret `CLOUDFLARE_API_TOKEN` it prints a notice and does
nothing. Every workflow installs with `npm ci --ignore-scripts`: nothing here
needs an install script.

**The nightly release.** The beach pages carry a tide table built with them.
Visitors' browsers rebuild it for today, but crawlers and readers without
JavaScript see the built one, so the nightly run rebuilds `main`'s head and
releases it through the same checks and rollback: the baked table is at most
a day old (the FAQ states nothing as today's). It only refreshes: when
production runs another commit (a rollback, a failed release) it changes
nothing and says why, so a rollback stays in place until `main` is fixed,
and when NOAA missed a beach during the build it releases nothing, keeping
the tables production has. Its versions and deployments are marked
"Nightly refresh:". If it fails or is turned off, nothing breaks; only the
baked table ages. GitHub disables a public repository's scheduled workflows
after 60 days without activity; Dependabot's weekly updates keep it active.

**Every day (`audit.yml`).** At 11:41 UTC: `npm run audit -- --strict`, and,
once releases are automatic, a check that production runs the head of `main`
and that its beach pages were built within two days
(`npm run health -- https://tideandtumble.app --expect-tag <commit>
--built-within-days 2`): three nightly refreshes in a row that released
nothing fail it. GitHub
emails a failed scheduled run to the person who last changed its `cron` line.
If the zone's bot protection challenges GitHub's runners, the check reports
itself blocked and fails.

**Dependabot (`dependabot.yml`).** Weekly, grouped (minor and patch together,
majors together), for releases at least three days old. Two packages are held,
each with its date and reason in the file: TypeScript from 6.1 and ESLint 10.

### Turning it on

Until it is done, CI and the daily audit run, the merge job leaves every
update for review, and nothing is released from GitHub. It is the owner's,
done once, after production is reached through the zone route (the release
checks `https://tideandtumble.app`): the release credentials go into the
repository's Actions secrets, Dependabot security updates are turned on, and
Deploy is run once on `main` (the merge job merges only once a Deploy run on
`main` has released, starts the release only when the merge commit's
parent is the head production was checked against, and passes that head to
the release, which changes nothing unless production still runs it). How the credentials are made and kept is in the
private operations record. The release credential is an account-owned API
token scoped to this one Worker with the Workers Editor role: it can upload,
deploy and roll back this Worker, and it cannot create or delete a Worker,
touch any other Worker, or change DNS, routes or custom domains. Creating the
Worker needs product-level Workers Admin, so the first release, which creates
it, is made once with a broader credential; every release after it uses the
scoped token. A `wrangler login` session cannot be scoped this way.

### Where the release credential reaches

The build runs the code of every package in the lockfile, so it runs in
`prepare-release`, which refuses to start with a Cloudflare credential in its
environment, and installs with install scripts off. `promote` holds the
credential and runs only Wrangler, on the `out/` that was checked. Release
with the token scoped to this Worker (Editor), given to that one command,
never with a `wrangler login` session, which cannot be scoped and can change
DNS or routes. Changing a route, a custom domain or DNS needs a zone
permission and is done by hand, never by `promote`.

## Version URLs and the workers.dev address

Version URLs are off (`"preview_urls": false`, written out; the design note, D3): no
version answers at an address of its own, so no superseded version stays
callable. The Worker's own `workers.dev` address stays on: the first release,
and a release while production cannot answer, are checked there. It serves
the same pages with `X-Robots-Tag: noindex`, and its API answers only
`GET /api/health`; the data routes answer only at `APP_ORIGIN`
(`https://tideandtumble.app`), behind the zone's security settings and cache.

## Reaching production

Production is reached through a Workers route on the site's own zone, and
`www` redirects to the apex. The operator sets both up outside this
repository. Nothing here can attach, move or remove them: `wrangler.jsonc`
declares no route or domain, and the release credential has no zone
permission. The cutover and hosting-rollback steps are in the private
operations record.

## Contributing and the release gate

1. Work on a branch and open a pull request into `main`.
2. Keep third-party assets limited to CC0, MIT, Apache, or public-domain
   material and update the relevant `CREDITS.md`.
3. `npm run verify` and `npm run audit` must pass on the reviewed commit; CI
   runs both.
4. Try the changed flows with `npm run preview`: accessibility, responsive
   layout, reduced-motion behaviour, and source attribution.
5. Merge only the reviewed commit. A merge to `main` is a release once
   releases are automatic.

Contributors do not need production access. Questions and suspected security
issues go to [hello@northglass.io](mailto:hello@northglass.io).

## What stays out of this repository

Safe public facts: the framework, the Node version, the site's address, the
public data providers, the commands and checks, and the decisions in
the design note's Decisions section. Never commit or publish:

- provider account, zone, route, team, project or tenant identifiers, or the
  account's `workers.dev` subdomain;
- tokens, session material, or where credentials are kept;
- DNS, registrar, nameserver, zone record or certificate administration;
- hostnames or paths used only for administration;
- incident notes, the cutover and hosting-rollback steps, recovery procedures
  and operator workarounds.

`test/app/opsec.test.ts` scans every tracked file (or, in an exported copy,
every file git would not ignore) for what these look like when they leak:
32-character ids, the `workers.dev` subdomain, commands that store a
credential, zone settings, rule syntax and request thresholds. It cannot read
prose: a sentence that describes the private record in other words passes,
so review holds the rest of the boundary.

## Known issues

- **ESLint 9** is out of upstream support; ESLint 10 is held until
  `eslint-config-next`'s plugins support it.
