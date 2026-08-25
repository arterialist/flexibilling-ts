import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AssetType,
  BillingProductStrategy,
  BillingService,
  BillingStatus,
  InMemoryBillingCache,
  InMemoryBillingRepository,
  InsufficientFundsError,
  MetricType,
  NoBillableUsageError,
  RatingEngine,
  UsageService,
  WaterfallEngine,
  getUsageSnapshot,
  withUsageSession,
} from "../src/index.ts";

test("rating supports fixed, quantity, duration, units, and dotted filters", () => {
  const usage = {
    customerId: "customer-1",
    service: UsageService.apiRequest,
    quantity: "3",
    durationSeconds: "12",
    inputUnits: 500,
    outputUnits: 200,
    eventMetadata: { result: { status: "qualified" }, duration_seconds: "180" },
  };
  assert.equal(RatingEngine.calculateCost({ service: usage.service, targetAsset: "units", metricType: MetricType.fixed, conversionRate: "5" }, usage).toString(), "5");
  assert.equal(RatingEngine.calculateCost({ service: usage.service, targetAsset: "units", metricType: MetricType.quantity, conversionRate: "2" }, usage).toString(), "6");
  assert.equal(RatingEngine.calculateCost({ service: usage.service, targetAsset: "units", metricType: MetricType.duration, conversionRate: "0.5" }, usage).toString(), "90");
  assert.equal(RatingEngine.calculateCost({ service: usage.service, targetAsset: "units", metricType: MetricType.units, conversionRate: "0.001" }, usage).toString(), "0.7");
  assert.equal(RatingEngine.matchesFilter({ service: usage.service, targetAsset: "units", metricType: MetricType.fixed, filterCondition: { "result.status": "qualified" } }, usage.eventMetadata), true);
});

test("waterfall distinguishes fallback, zero usage, and insufficient funds", () => {
  const engine = new WaterfallEngine();
  const usage = { customerId: "customer-1", service: UsageService.apiRequest, units: 60 };
  const result = engine.evaluate(
    [
      { service: usage.service, targetAsset: AssetType.units, metricType: MetricType.units, priority: 10 },
      { service: usage.service, targetAsset: AssetType.prepaidUnits, metricType: MetricType.units, priority: 20 },
    ],
    usage,
    { units: "0", prepaid_units: "200" },
  );
  assert.equal(result.assetType, AssetType.prepaidUnits);
  assert.equal(result.amount.toString(), "60");
  assert.throws(() => engine.evaluate([{ service: usage.service, targetAsset: "units", metricType: MetricType.units }], { ...usage, units: undefined }, { units: "100" }), NoBillableUsageError);
  assert.throws(() => engine.evaluate([{ service: usage.service, targetAsset: "units", metricType: MetricType.units }], { ...usage, units: 100 }, { units: "50" }), InsufficientFundsError);
});

test("service processes usage, writes a ledger, and keeps funding idempotent", async () => {
  const repo = new InMemoryBillingRepository({
    rules: [{ service: UsageService.apiRequest, targetAsset: AssetType.units, metricType: MetricType.units }],
    products: [{ externalProductId: "plan-standard", assetType: AssetType.units, amount: "100", strategy: BillingProductStrategy.topUp }],
  });
  const cache = new InMemoryBillingCache();
  const service = new BillingService(repo, cache, { clock: () => new Date("2026-08-20T00:00:00Z") });
  await repo.upsertBalance("customer-1", AssetType.units, "100");
  const record = { id: "usage-1", customerId: "customer-1", service: UsageService.apiRequest, units: 30 };
  repo.records.push(record);

  await service.processRecord(record);
  assert.equal(record.billingStatus, BillingStatus.processed);
  assert.equal((await cache.getAssetAmount("customer-1", AssetType.units))?.toString(), "70");
  assert.equal(repo.transactions[0]?.transactionType, "usage");
  assert.equal((await cache.getStats("customer-1", "2026-08")).total_usage_count, "1");

  assert.equal(await service.fundCustomer("customer-1", ["plan-standard"], "payment-1"), true);
  assert.equal(await service.fundCustomer("customer-1", ["plan-standard"], "payment-1"), false);
  assert.equal((await repo.getCustomerBalances("customer-1"))[0]?.amount.toString(), "170");
});

test("usage sessions, snapshots, and charge/refund compose with the same repository", async () => {
  const repo = new InMemoryBillingRepository();
  const cache = new InMemoryBillingCache();
  const service = new BillingService(repo, cache);
  await withUsageSession(
    { customerId: "customer-1", service: UsageService.backgroundTask, usageRepository: repo, referenceId: "job-1" },
    async (context) => context.report({ durationSeconds: "95", inputUnits: 10 }),
  );
  assert.equal(repo.records[0]?.eventMetadata?.duration_seconds, 95);

  await repo.upsertBalance("customer-1", AssetType.units, "90");
  await service.charge("customer-1", AssetType.units, "10");
  await service.refund("customer-1", AssetType.units, "10");
  const snapshot = await getUsageSnapshot("customer-1", [AssetType.units], cache, new Date("2026-08-20T00:00:00Z"));
  assert.deepEqual(snapshot, { period: "2026-08", metrics: { units: { used: 10, total: 100 } } });
});
