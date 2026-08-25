# FlexiBilling for TypeScript

Billing and usage metering for TypeScript backends. FlexiBilling tracks named
balances, rates usage, and applies priority rules.

The billing code does not depend on storage, caches, web frameworks, or payment
providers. Implement `BillingRepository` and `BillingCache` against an existing
backend, or use the in-memory adapters in tests and examples.

The [FlexiBilling contract](https://github.com/arterialist/flexibilling) defines
the behavior shared by the language packages.

## Install

```bash
npm install flexibilling
```

The package uses `decimal.js` for balance and ledger arithmetic. It does not use
binary floating-point values for those amounts.

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

console.log(await cache.getBalances("customer-1"));
// { units: "88", can_transact: "1" }
```

## Main components

- `RatingEngine` calculates fixed, quantity, duration, and units costs.
- `WaterfallEngine` selects the first fundable rule by priority.
- `BillingService` processes records, funds products, charges, refunds, and
  updates cache views.
- `BillingRepository` and `BillingCache` define the backend ports.
- `InMemoryBillingRepository` and `InMemoryBillingCache` support tests and
  examples.
- `withUsageSession` records usage at an operation boundary.
- `BillingWorker` processes pending usage records.
- `getUsageSnapshot` returns used and remaining totals for a billing period.

## Development

```bash
npm ci
npm run check:typescript
npm run check
npm run check:tests
npm test
npm run build
```

The package requires Node.js 22 or newer and pins TypeScript 7 for builds.
The SQLite integration test uses a file-backed `better-sqlite3` database. It
checks service processing, workers, idempotent funding, refunds, and reopening
the database.

See [CONTRIBUTING.md](CONTRIBUTING.md) for release and integration guidance.
