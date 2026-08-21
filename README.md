# FlexiBilling for TypeScript

Provider-agnostic usage metering, multi-asset balances, and configurable
priority waterfalls for TypeScript backends.

The package keeps billing decisions independent from storage, caches, web
frameworks, and payment providers. Implement `BillingRepository` and
`BillingCache` for an existing backend, or use the included in-memory adapters
for tests and local development.

The behavior is defined by the [language-neutral FlexiBilling contract](https://github.com/arterialist/flexibilling).

## Install

```bash
npm install flexibilling
```

The current package uses `decimal.js` so balance and ledger arithmetic does not
depend on binary floating-point values.

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

## API surface

- `RatingEngine` calculates fixed, quantity, duration, and units costs.
- `WaterfallEngine` selects the first fundable rule in priority order.
- `BillingService` processes records, funds products, charges, refunds, and
  synchronizes cache views.
- `BillingRepository` and `BillingCache` are the backend extension points.
- `InMemoryBillingRepository` and `InMemoryBillingCache` provide a reference
  adapter for tests and examples.
- `withUsageSession` records accumulated usage at an operation boundary.
- `BillingWorker` drains pending usage records.
- `getUsageSnapshot` exposes used and remaining totals for a billing period.

## Development

```bash
npm install
npm run check
npm test
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for release and integration guidance.
