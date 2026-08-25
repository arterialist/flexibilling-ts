# FlexiBilling for TypeScript

[![CI](https://github.com/arterialist/flexibilling-ts/actions/workflows/ci.yaml/badge.svg)](https://github.com/arterialist/flexibilling-ts/actions/workflows/ci.yaml)
[![npm](https://img.shields.io/npm/v/flexibilling.svg)](https://www.npmjs.com/package/flexibilling)
[![Docs](https://img.shields.io/badge/docs-online-blue.svg)](https://arterialist.github.io/flexibilling-ts/)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

FlexiBilling is a billing engine for TypeScript backends. It
tracks named balances, rates usage, applies priority rules, writes ledger
entries, and processes pending usage records.

The package leaves storage, web frameworks, caches, and payment providers to the
host application. Implement `BillingRepository` and `BillingCache` against an
existing backend, or use the included in-memory adapters.

## Install

```bash
npm install flexibilling
```

The package uses `decimal.js` for balance and ledger arithmetic. Amounts stay
out of binary floating-point arithmetic.

## Quickstart

```ts
import {
  AssetType,
  BillingService,
  InMemoryBillingCache,
  InMemoryBillingRepository,
  MetricType,
  UsageService,
} from "flexibilling";

const repository = new InMemoryBillingRepository({
  rules: [{
    service: UsageService.apiRequest,
    targetAsset: AssetType.units,
    metricType: MetricType.units,
    conversionRate: "1",
    priority: 10,
  }],
});
const cache = new InMemoryBillingCache();
const billing = new BillingService(repository, cache);

await repository.upsertBalance("customer-1", AssetType.units, "100");
const record = {
  id: "usage-1",
  customerId: "customer-1",
  service: UsageService.apiRequest,
  units: 12,
};
repository.records.push(record);
await billing.processRecord(record);
```

Asset and service names are open strings. The exported constants only shorten
examples.

## Usage sessions

Use `withUsageSession` when an operation discovers usage while it runs:

```ts
import { UsageService, withUsageSession } from "flexibilling";

await withUsageSession(
  {
    customerId: "customer-1",
    service: UsageService.apiRequest,
    usageRepository,
    referenceId: "request-123",
  },
  async (usage) => {
    usage.report({ units: 12, durationSeconds: "0.45" });
  },
);
```

`durationSeconds` is stored as a record field and mirrored to
`eventMetadata.duration_seconds` when the caller has not supplied that key.
That lets duration rules use a stable value while preserving backend metadata.
Set `writeOnException: false` to skip a record when the operation throws.

## Included components

- `BillingService` funds accounts, rates usage, charges, refunds, and updates cache views.
- `BillingRepository`, `UsageRepository`, and `BillingCache` define backend ports.
- `RatingEngine` and `WaterfallEngine` calculate costs and select fundable rules.
- `withUsageSession` records usage at an operation boundary.
- `BillingWorker` processes pending records and records each outcome.
- The in-memory adapters are useful in tests and local programs.

## Documentation

Read the [TypeScript documentation](https://arterialist.github.io/flexibilling-ts/)
for the quickstart, concepts, backend ports, integrations, operations, and
release process.

## Development

```bash
npm ci
npm run check:typescript
npm run check
npm run check:tests
npm test
npm run build
uvx --with mkdocs-material mkdocs build --strict
```

The package requires Node.js 22 or newer and uses TypeScript 7 for builds.
Releases use the npm trusted publisher configured for GitHub Actions.

## License

Apache-2.0. See [LICENSE](LICENSE).
