# Quickstart

This guide uses the in-memory adapters. The service calls stay the same when
you implement the repository and cache ports with a real backend.

## 1. Install

```bash
mkdir billing-example
cd billing-example
npm init -y
npm install flexibilling
```

## 2. Define a rule and balance

The first rule charges one unit for each metered unit:

```ts
import {
  AssetType,
  BillingService,
  InMemoryBillingCache,
  InMemoryBillingRepository,
  MetricType,
  UsageService,
} from "flexibilling";

const customerId = "customer-001";
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
const service = new BillingService(repository, cache);

await repository.upsertBalance(customerId, AssetType.units, "100");
```

## 3. Process usage

```ts
const record = {
  id: "usage-1",
  customerId,
  service: UsageService.apiRequest,
  referenceId: "request-1001",
  units: 12,
};
repository.records.push(record);

await service.processRecord(record);
console.log(await cache.getBalances(customerId));
// { units: "88", can_transact: "1" }
```

The service selects an active rule by priority, calculates the cost, deducts
the selected balance, writes a ledger transaction, updates the cache, and
marks the record processed.

## 4. Track an operation session

```ts
import { withUsageSession } from "flexibilling";

await withUsageSession(
  {
    customerId,
    service: UsageService.apiRequest,
    usageRepository,
    variant: "standard",
    referenceId: "request-1002",
  },
  async (usage) => {
    usage.report({ units: 24, durationSeconds: "0.45" });
  },
);
```

The session creates one pending `UsageRecord` when it has non-zero metrics.
`durationSeconds` is written to the record and mirrored to
`eventMetadata.duration_seconds`. Set `writeOnException: false` to skip a
record when the operation throws.

## 5. Use a custom backend

Implement `BillingRepository` and `UsageRepository` for the host database, and
`BillingCache` for balance views. Use a database-backed implementation in
production.
