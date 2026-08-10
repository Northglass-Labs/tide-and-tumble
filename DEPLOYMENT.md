# Public release policy

Tide & Tumble is a public Next.js application hosted at
[tideandtumble.app](https://tideandtumble.app).

This document intentionally covers only the public engineering contract. Operator
accounts, credentials, DNS records, provider identifiers, recovery procedures, and
production-control details belong in Northglass's private operations system and must
not be copied into this repository, issues, pull requests, build logs, or screenshots.

## Local verification

Use a supported Node.js release and install from the lockfile:

```bash
npm ci
npm test
npm run lint
npm run build
```

The app has no repository-managed production secrets. Its runtime data comes from the
public NOAA CO-OPS, NDBC, National Weather Service, OpenStreetMap, and Zippopotam.us
services described in the README.

## Contribution and release gate

1. Work on a feature branch and open a pull request into `main`.
2. Keep third-party assets limited to CC0, MIT, Apache, or public-domain material and
   update the relevant `CREDITS.md`.
3. Require the full test, lint, and production-build checks to pass on the reviewed
   commit.
4. Review the preview for the changed user flows, accessibility, responsive layout,
   reduced-motion behavior, and source attribution.
5. Merge only the reviewed commit. Production promotion is an operator action governed
   by private Northglass controls.

Contributors do not need production access. Release questions and suspected security
issues should be sent to [hello@northglass.io](mailto:hello@northglass.io).

## Public configuration boundary

Safe public facts include the framework, supported Node.js version, canonical public
domain, public data providers, build commands, and the expected release checks.

Do not commit or publish:

- provider account, team, project, or tenant identifiers;
- access tokens, session material, vault references, or credential locations;
- DNS registrar, nameserver, zone, record, or certificate-administration details;
- hostnames or paths used only for private administration;
- incident notes, migration history, recovery procedures, or operator workarounds.

If one of those details is needed to operate the service, update the private operations
record rather than expanding this file.
