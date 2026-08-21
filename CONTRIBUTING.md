# Contributing

## Setup

```bash
npm install
```

Run the complete local checks before opening a change:

```bash
npm run check
npm test
npm run build
```

The tests cover exact-decimal rating, dotted metadata filters, waterfall
fallbacks, zero-usage and insufficient-funds errors, ledger writes, product
idempotency, sessions, snapshots, and charge/refund behavior.

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
