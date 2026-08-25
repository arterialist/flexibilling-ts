import {
  AssetType,
  BillingService,
  InMemoryBillingCache,
  InMemoryBillingRepository,
  MetricType,
  UsageService,
} from "../src/index.ts";

const repository = new InMemoryBillingRepository({
  rules: [{
    service: UsageService.apiRequest,
    targetAsset: AssetType.units,
    metricType: MetricType.units,
    conversionRate: "1",
  }],
});
const cache = new InMemoryBillingCache();
const service = new BillingService(repository, cache);

await repository.upsertBalance("customer-1", AssetType.units, "100");
const record = {
  id: "request-1",
  customerId: "customer-1",
  service: UsageService.apiRequest,
  units: 12,
};
repository.records.push(record);
await service.processRecord(record);

console.log(await cache.getBalances("customer-1"));
