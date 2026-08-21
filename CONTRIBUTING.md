# Contributing

## Setup

Use Node.js 22 or newer. CI currently verifies with Node.js 26 and TypeScript
7.0.2.

```bash
npm ci
```

Run the complete local checks before opening a change:

```bash
npm run check:typescript
npm run check
npm run check:tests
npm test
npm run build
```

The tests cover exact-decimal rating, dotted metadata filters, waterfall
fallbacks, zero-usage and insufficient-funds errors, ledger writes, product
idempotency, sessions, snapshots, and charge/refund behavior.

`tests/sqlite.integration.test.ts` is the minimal real-backend conformance
test. It uses a temporary file-backed SQLite database and implements the
exported repository/cache ports without changing the library implementation.

## Backend adapters

Implement `BillingRepository` against the host application's transaction and
storage layer. Implement `BillingCache` for the materialized balance, period
counter, and activity-feed views. Keep balance mutation and ledger insertion in
the same host transaction. Cache writes should be treated as derived views and
must not change the billing decision.

Services and assets are open strings. The exported constants are neutral
conveniences for examples, not a closed registry.

## Releases

Create a GitHub release with a semver tag. The release workflow builds the
package and can publish it to npm with provenance after the repository's npm
trusted publishing configuration is enabled.
