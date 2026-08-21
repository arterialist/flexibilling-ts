import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import Database from "better-sqlite3";

import {
  type AmountInput,
  type ActivityEvent,
  type AssetName,
  type BalanceTransaction,
  type BalanceTransactionCreate,
  type BillingCache,
  type BillingProduct,
  type BillingRepository,
  type BillingRule,
  type BillingStats,
  type CustomerBalance,
  type CustomerId,
  type Metadata,
  type RecordId,
  type ServiceName,
  type UsageRecord,
  type UsageRecordCreate,
  type UsageRepository,
  type UsageSummary,
  BillingProductStrategy,
  BillingService,
  BillingStatus,
  BillingWorker,
  InsufficientFundsError,
  MetricType,
  TransactionType,
  decimal,
  getUsageSnapshot,
  withUsageSession,
} from "../src/index.ts";

type SqliteRow = Record<string, any>;

class SqliteBillingBackend implements BillingRepository, UsageRepository, BillingCache {
  private readonly db: Database.Database;

  constructor(filename: string) {
    this.db = new Database(filename);
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS billing_rules (
        id TEXT PRIMARY KEY,
        service TEXT NOT NULL,
        target_asset TEXT NOT NULL,
        metric_type TEXT NOT NULL,
        conversion_rate TEXT NOT NULL,
        priority INTEGER NOT NULL,
        filter_condition TEXT,
        refund_service_type TEXT,
        is_active INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS billing_products (
        external_product_id TEXT PRIMARY KEY,
        asset_type TEXT NOT NULL,
        amount TEXT NOT NULL,
        strategy TEXT NOT NULL,
        description TEXT,
        is_active INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS balances (
        customer_id TEXT NOT NULL,
        asset_type TEXT NOT NULL,
        amount TEXT NOT NULL,
        PRIMARY KEY (customer_id, asset_type)
      );
      CREATE TABLE IF NOT EXISTS usage_records (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        service TEXT NOT NULL,
        variant TEXT NOT NULL,
        reference_id TEXT,
        quantity TEXT,
        duration_seconds TEXT,
        units INTEGER,
        input_units INTEGER,
        output_units INTEGER,
        cached_units INTEGER,
        billing_status TEXT NOT NULL,
        billing_error_message TEXT,
        event_metadata TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id TEXT NOT NULL,
        asset_type TEXT NOT NULL,
        amount TEXT NOT NULL,
        balance_after TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        source_usage_id TEXT,
        payment_reference TEXT,
        description TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cache_balances (
        customer_id TEXT NOT NULL,
        asset_type TEXT NOT NULL,
        amount TEXT NOT NULL,
        PRIMARY KEY (customer_id, asset_type)
      );
      CREATE TABLE IF NOT EXISTS cache_stats (
        customer_id TEXT NOT NULL,
        month TEXT NOT NULL,
        metric TEXT NOT NULL,
        amount TEXT NOT NULL,
        PRIMARY KEY (customer_id, month, metric)
      );
      CREATE TABLE IF NOT EXISTS cache_feed (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id TEXT NOT NULL,
        time TEXT NOT NULL,
        action TEXT NOT NULL,
        cost TEXT NOT NULL,
        result TEXT NOT NULL
      );
    `);
  }

  close(): void {
    this.db.close();
  }

  begin(): void {
    this.db.exec("BEGIN");
  }

  commit(): void {
    this.db.exec("COMMIT");
  }

  rollback(): void {
    if (this.db.inTransaction) this.db.exec("ROLLBACK");
  }

  seedRule(rule: BillingRule): void {
    this.db.prepare(`
      INSERT INTO billing_rules
        (id, service, target_asset, metric_type, conversion_rate, priority,
         filter_condition, refund_service_type, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      rule.id ?? crypto.randomUUID(),
      rule.service,
      rule.targetAsset,
      rule.metricType,
      decimal(rule.conversionRate ?? "1").toString(),
      rule.priority ?? 100,
      rule.filterCondition ? JSON.stringify(rule.filterCondition) : null,
      rule.refundServiceType ?? null,
      rule.isActive === false ? 0 : 1,
    );
  }

  seedProduct(product: BillingProduct): void {
    this.db.prepare(`
      INSERT INTO billing_products
        (external_product_id, asset_type, amount, strategy, description, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      product.externalProductId,
      product.assetType,
      decimal(product.amount).toString(),
      product.strategy ?? BillingProductStrategy.topUp,
      product.description ?? null,
      product.isActive === false ? 0 : 1,
    );
  }

  transactionCount(): number {
    return Number(this.get<{ count: number }>("SELECT COUNT(*) AS count FROM transactions")?.count ?? 0);
  }

  async getActiveRules(service: ServiceName): Promise<BillingRule[]> {
    return this.all("SELECT * FROM billing_rules WHERE service = ? AND is_active = 1 ORDER BY priority", [service])
      .map((row) => ({
        service: row.service as ServiceName,
        targetAsset: row.target_asset as AssetName,
        metricType: row.metric_type,
        conversionRate: row.conversion_rate,
        priority: Number(row.priority),
        filterCondition: row.filter_condition ? JSON.parse(row.filter_condition) as Metadata : undefined,
        refundServiceType: row.refund_service_type ?? undefined,
        isActive: Boolean(row.is_active),
        id: row.id,
      }));
  }

  async getCustomerBalances(customerId: CustomerId): Promise<CustomerBalance[]> {
    return this.all("SELECT * FROM balances WHERE customer_id = ?", [customerId]).map((row) => ({
      customerId,
      assetType: row.asset_type,
      amount: row.amount,
    }));
  }

  async upsertBalance(customerId: CustomerId, assetType: AssetName, amount: AmountInput): Promise<CustomerBalance> {
    const value = decimal(amount).toString();
    this.db.prepare(`
      INSERT INTO balances (customer_id, asset_type, amount) VALUES (?, ?, ?)
      ON CONFLICT(customer_id, asset_type) DO UPDATE SET amount = excluded.amount
    `).run(customerId, assetType, value);
    return { customerId, assetType, amount: value };
  }

  async decrementBalance(customerId: CustomerId, assetType: AssetName, deduction: AmountInput): Promise<string> {
    const current = decimal(this.get<{ amount: string }>(
      "SELECT amount FROM balances WHERE customer_id = ? AND asset_type = ?",
      [customerId, assetType],
    )?.amount ?? "0");
    const amount = decimal(deduction);
    if (current.lt(amount)) throw new InsufficientFundsError(customerId, "charge");
    const next = current.sub(amount).toString();
    this.db.prepare("UPDATE balances SET amount = ? WHERE customer_id = ? AND asset_type = ?")
      .run(next, customerId, assetType);
    return next;
  }

  async incrementBalance(customerId: CustomerId, assetType: AssetName, addition: AmountInput): Promise<string> {
    const current = decimal(this.get<{ amount: string }>(
      "SELECT amount FROM balances WHERE customer_id = ? AND asset_type = ?",
      [customerId, assetType],
    )?.amount ?? "0");
    const next = current.add(addition).toString();
    this.db.prepare(`
      INSERT INTO balances (customer_id, asset_type, amount) VALUES (?, ?, ?)
      ON CONFLICT(customer_id, asset_type) DO UPDATE SET amount = excluded.amount
    `).run(customerId, assetType, next);
    return next;
  }

  async createTransaction(data: BalanceTransactionCreate): Promise<BalanceTransaction> {
    const createdAt = new Date();
    const result = this.db.prepare(`
      INSERT INTO transactions
        (customer_id, asset_type, amount, balance_after, transaction_type,
         source_usage_id, payment_reference, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.customerId,
      data.assetType,
      decimal(data.amount).toString(),
      decimal(data.balanceAfter).toString(),
      data.transactionType,
      data.sourceUsageId ?? null,
      data.paymentReference ?? null,
      data.description ?? null,
      createdAt.toISOString(),
    );
    return {
      ...data,
      id: String(result.lastInsertRowid),
      createdAt,
    };
  }

  async getTransactionForUsage(referenceId: RecordId, service: ServiceName, customerId: CustomerId): Promise<BalanceTransaction | undefined> {
    const row = this.get<SqliteRow>(`
      SELECT t.* FROM transactions t
      JOIN usage_records u ON u.id = t.source_usage_id
      WHERE u.reference_id = ? AND u.service = ? AND t.customer_id = ?
        AND t.transaction_type = 'usage'
      ORDER BY t.id DESC LIMIT 1
    `, [referenceId, service, customerId]);
    return row ? this.transactionFromRow(row) : undefined;
  }

  async getTransactionByReference(paymentReference: string): Promise<BalanceTransaction | undefined> {
    const row = this.get<SqliteRow>(
      "SELECT * FROM transactions WHERE payment_reference = ? ORDER BY id LIMIT 1",
      [paymentReference],
    );
    return row ? this.transactionFromRow(row) : undefined;
  }

  async getProductsForExternalIds(externalProductIds: string[]): Promise<BillingProduct[]> {
    if (externalProductIds.length === 0) return [];
    const placeholders = externalProductIds.map(() => "?").join(",");
    return this.all(`SELECT * FROM billing_products WHERE is_active = 1 AND external_product_id IN (${placeholders})`, externalProductIds)
      .map((row) => ({
        externalProductId: row.external_product_id,
        assetType: row.asset_type,
        amount: row.amount,
        strategy: row.strategy,
        description: row.description ?? undefined,
        isActive: Boolean(row.is_active),
      }));
  }

  async getPendingRecords(limit: number): Promise<UsageRecord[]> {
    return this.all("SELECT * FROM usage_records WHERE billing_status = 'pending' ORDER BY created_at LIMIT ?", [limit])
      .map((row) => this.recordFromRow(row));
  }

  async markRecordProcessed(recordId: RecordId): Promise<void> {
    this.db.prepare("UPDATE usage_records SET billing_status = 'processed' WHERE id = ?").run(recordId);
  }

  async markRecordFailed(recordId: RecordId, message: string): Promise<void> {
    this.db.prepare("UPDATE usage_records SET billing_status = 'failed', billing_error_message = ? WHERE id = ?")
      .run(message, recordId);
  }

  async markRecordSkipped(recordId: RecordId): Promise<void> {
    this.db.prepare("UPDATE usage_records SET billing_status = 'skipped' WHERE id = ?").run(recordId);
  }

  async create(data: UsageRecordCreate): Promise<UsageRecord> {
    const id = crypto.randomUUID();
    const createdAt = new Date();
    this.db.prepare(`
      INSERT INTO usage_records
        (id, customer_id, service, variant, reference_id, quantity,
         duration_seconds, units, input_units, output_units, cached_units,
         billing_status, billing_error_message, event_metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.customerId,
      data.service,
      data.variant ?? "default",
      data.referenceId ?? null,
      data.quantity === undefined ? null : decimal(data.quantity).toString(),
      data.durationSeconds === undefined ? null : decimal(data.durationSeconds).toString(),
      data.units ?? null,
      data.inputUnits ?? null,
      data.outputUnits ?? null,
      data.cachedUnits ?? null,
      data.billingStatus ?? BillingStatus.pending,
      data.billingErrorMessage ?? null,
      data.eventMetadata ? JSON.stringify(data.eventMetadata) : null,
      createdAt.toISOString(),
    );
    return { ...data, id, variant: data.variant ?? "default", billingStatus: data.billingStatus ?? BillingStatus.pending, createdAt };
  }

  async getByCustomer(customerId: CustomerId, skip = 0, limit = 100): Promise<UsageRecord[]> {
    return this.all("SELECT * FROM usage_records WHERE customer_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?", [customerId, limit, skip])
      .map((row) => this.recordFromRow(row));
  }

  async getUsageSummary(customerId: CustomerId, fromDate?: Date, toDate?: Date): Promise<UsageSummary[]> {
    const records = this.filteredRecords(customerId, fromDate, toDate);
    const groups = new Map<string, UsageRecord[]>();
    for (const record of records) {
      const key = `${record.service}\u0000${record.variant ?? "default"}`;
      groups.set(key, [...(groups.get(key) ?? []), record]);
    }
    return [...groups].map(([key, group]) => {
      const [service, variant] = key.split("\u0000");
      return {
        service,
        variant,
        usageCount: group.length,
        totalQuantity: sumDecimal(group.map((record) => record.quantity)),
        totalDurationSeconds: sumDecimal(group.map((record) => record.durationSeconds)),
        totalUnits: sumInteger(group.map((record) => record.units)),
        totalInputUnits: sumInteger(group.map((record) => record.inputUnits)),
        totalOutputUnits: sumInteger(group.map((record) => record.outputUnits)),
        totalCachedUnits: sumInteger(group.map((record) => record.cachedUnits)),
      };
    });
  }

  async getUsageRecords(
    customerId: CustomerId,
    fromDate?: Date,
    toDate?: Date,
    service?: ServiceName,
    limit = 50,
    offset = 0,
  ): Promise<{ records: UsageRecord[]; total: number }> {
    const records = this.filteredRecords(customerId, fromDate, toDate, service);
    return { records: records.slice(offset, offset + limit), total: records.length };
  }

  async setBalances(customerId: CustomerId, balances: Record<AssetName, AmountInput>): Promise<void> {
    this.db.prepare("DELETE FROM cache_balances WHERE customer_id = ?").run(customerId);
    const insert = this.db.prepare("INSERT INTO cache_balances (customer_id, asset_type, amount) VALUES (?, ?, ?)");
    for (const [asset, amount] of Object.entries(balances)) insert.run(customerId, asset, decimal(amount).toString());
  }

  async updateSingleBalance(customerId: CustomerId, assetType: AssetName, amount: AmountInput): Promise<void> {
    this.db.prepare(`
      INSERT INTO cache_balances (customer_id, asset_type, amount) VALUES (?, ?, ?)
      ON CONFLICT(customer_id, asset_type) DO UPDATE SET amount = excluded.amount
    `).run(customerId, assetType, decimal(amount).toString());
  }

  async getBalances(customerId: CustomerId): Promise<Record<string, string>> {
    const values: Record<string, string> = {};
    for (const row of this.all("SELECT asset_type, amount FROM cache_balances WHERE customer_id = ?", [customerId])) {
      values[row.asset_type] = row.amount;
    }
    values.can_transact = Object.entries(values).some(([asset, amount]) => asset !== "can_transact" && decimal(amount).gt(0)) ? "1" : "0";
    return values;
  }

  async canTransact(customerId: CustomerId): Promise<boolean> {
    const balances = await this.getBalances(customerId);
    return balances.can_transact === "1";
  }

  async getAssetAmount(customerId: CustomerId, assetType: AssetName): Promise<ReturnType<typeof decimal> | undefined> {
    const value = this.get<{ amount: string }>(
      "SELECT amount FROM cache_balances WHERE customer_id = ? AND asset_type = ?",
      [customerId, assetType],
    )?.amount;
    return value === undefined ? undefined : decimal(value);
  }

  async deleteBalances(customerId: CustomerId): Promise<void> {
    this.db.prepare("DELETE FROM cache_balances WHERE customer_id = ?").run(customerId);
  }

  async incrementStats(customerId: CustomerId, month: string, stats: BillingStats): Promise<void> {
    const values: Record<string, AmountInput> = {
      total_usage_count: stats.usageCount ?? 0,
      total_quantity: stats.quantity ?? 0,
      total_spend: stats.spend ?? 0,
    };
    for (const [name, amount] of Object.entries(stats.custom ?? {})) values[`total_custom:${name}`] = amount;
    for (const [metric, amount] of Object.entries(values)) {
      if (decimal(amount).eq(0)) continue;
      const current = this.get<{ amount: string }>(
        "SELECT amount FROM cache_stats WHERE customer_id = ? AND month = ? AND metric = ?",
        [customerId, month, metric],
      )?.amount ?? "0";
      const next = decimal(current).add(amount).toString();
      this.db.prepare(`
        INSERT INTO cache_stats (customer_id, month, metric, amount) VALUES (?, ?, ?, ?)
        ON CONFLICT(customer_id, month, metric) DO UPDATE SET amount = excluded.amount
      `).run(customerId, month, metric, next);
    }
  }

  async getStats(customerId: CustomerId, month: string): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const row of this.all("SELECT metric, amount FROM cache_stats WHERE customer_id = ? AND month = ?", [customerId, month])) {
      result[row.metric] = row.amount;
    }
    return result;
  }

  async pushFeedEvent(customerId: CustomerId, event: Omit<ActivityEvent, "time"> & { time?: Date | string }): Promise<void> {
    this.db.prepare("INSERT INTO cache_feed (customer_id, time, action, cost, result) VALUES (?, ?, ?, ?, ?)")
      .run(customerId, event.time instanceof Date ? event.time.toISOString() : event.time ?? new Date().toISOString(), event.action, event.cost, event.result);
  }

  async getFeed(customerId: CustomerId, limit = 20): Promise<ActivityEvent[]> {
    return this.all("SELECT time, action, cost, result FROM cache_feed WHERE customer_id = ? ORDER BY id DESC LIMIT ?", [customerId, limit])
      .map((row) => ({ time: row.time, action: row.action, cost: row.cost, result: row.result }));
  }

  async deleteCustomerCache(customerId: CustomerId): Promise<void> {
    this.db.prepare("DELETE FROM cache_balances WHERE customer_id = ?").run(customerId);
    this.db.prepare("DELETE FROM cache_feed WHERE customer_id = ?").run(customerId);
    this.db.prepare("DELETE FROM cache_stats WHERE customer_id = ?").run(customerId);
  }

  private get<T extends SqliteRow>(sql: string, params: unknown[] = []): T | undefined {
    return this.db.prepare(sql).get(...params as any[]) as T | undefined;
  }

  private all<T extends SqliteRow = SqliteRow>(sql: string, params: unknown[] = []): T[] {
    return this.db.prepare(sql).all(...params as any[]) as T[];
  }

  private transactionFromRow(row: SqliteRow): BalanceTransaction {
    return {
      customerId: row.customer_id,
      assetType: row.asset_type,
      amount: row.amount,
      balanceAfter: row.balance_after,
      transactionType: row.transaction_type,
      id: String(row.id),
      sourceUsageId: row.source_usage_id ?? undefined,
      paymentReference: row.payment_reference ?? undefined,
      description: row.description ?? undefined,
      createdAt: new Date(row.created_at),
    };
  }

  private recordFromRow(row: SqliteRow): UsageRecord {
    return {
      customerId: row.customer_id,
      service: row.service,
      variant: row.variant,
      id: row.id,
      referenceId: row.reference_id ?? undefined,
      quantity: row.quantity ?? undefined,
      durationSeconds: row.duration_seconds ?? undefined,
      units: row.units == null ? undefined : Number(row.units),
      inputUnits: row.input_units == null ? undefined : Number(row.input_units),
      outputUnits: row.output_units == null ? undefined : Number(row.output_units),
      cachedUnits: row.cached_units == null ? undefined : Number(row.cached_units),
      billingStatus: row.billing_status,
      billingErrorMessage: row.billing_error_message ?? undefined,
      eventMetadata: row.event_metadata ? JSON.parse(row.event_metadata) as Metadata : undefined,
      createdAt: new Date(row.created_at),
    };
  }

  private filteredRecords(customerId: CustomerId, fromDate?: Date, toDate?: Date, service?: ServiceName): UsageRecord[] {
    return this.all("SELECT * FROM usage_records WHERE customer_id = ? ORDER BY created_at DESC", [customerId])
      .map((row) => this.recordFromRow(row))
      .filter((record) => {
        if (service && record.service !== service) return false;
        if (fromDate && (!record.createdAt || record.createdAt < fromDate)) return false;
        if (toDate && (!record.createdAt || record.createdAt > toDate)) return false;
        return true;
      });
  }
}

function sumDecimal(values: (string | number | undefined)[]): number | undefined {
  const present = values.filter((value): value is string | number => value !== undefined);
  return present.length === 0 ? undefined : present.reduce((total, value) => total.add(value), decimal("0")).toNumber();
}

function sumInteger(values: (number | undefined)[]): number | undefined {
  const present = values.filter((value): value is number => value !== undefined);
  return present.length === 0 ? undefined : present.reduce((total, value) => total + value, 0);
}

test("public repository and cache ports work with a persistent SQLite backend", async () => {
  const directory = mkdtempSync(join(tmpdir(), "flexibilling-ts-"));
  const filename = join(directory, "billing.sqlite");
  const backend = new SqliteBillingBackend(filename);
  try {
    backend.seedRule({ service: "api_request", targetAsset: "units", metricType: MetricType.units, conversionRate: "1", priority: 10 });
    backend.seedProduct({ externalProductId: "plan-standard", assetType: "units", amount: "100", strategy: BillingProductStrategy.topUp });
    await backend.upsertBalance("customer-1", "units", "100");

    const service = new BillingService(backend, backend, { clock: () => new Date("2026-08-20T00:00:00Z") });
    const first = await backend.create({ customerId: "customer-1", service: "api_request", units: 4 });
    backend.begin();
    try {
      await service.processRecord(first, backend);
      backend.commit();
    } catch (error) {
      backend.rollback();
      throw error;
    }
    assert.equal((await backend.getByCustomer("customer-1")).find((record) => record.id === first.id)?.billingStatus, BillingStatus.processed);
    assert.equal((await backend.getAssetAmount("customer-1", "units"))?.toString(), "96");
    assert.equal(backend.transactionCount(), 1);

    backend.begin();
    try {
      assert.equal(await service.fundCustomer("customer-1", ["plan-standard"], "payment-1", backend), true);
      backend.commit();
    } catch (error) {
      backend.rollback();
      throw error;
    }
    assert.equal(await service.fundCustomer("customer-1", ["plan-standard"], "payment-1"), false);
    assert.equal((await backend.getAssetAmount("customer-1", "units"))?.toString(), "196");

    await withUsageSession(
      { customerId: "customer-1", service: "api_request", usageRepository: backend, referenceId: "request-2" },
      async (context) => context.report({ units: 2, durationSeconds: "1.5" }),
    );
    const worker = new BillingWorker(service, backend, 10);
    const pending = await backend.getPendingRecords(10);
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.eventMetadata?.duration_seconds, 1.5);
    assert.deepEqual(await worker.runOnce(backend), { fetched: 1, processed: 1, skipped: 0, failed: 0, retried: 0 });

    const failed = await backend.create({ customerId: "customer-1", service: "api_request", units: 999 });
    const failureResult = await worker.runOnce(backend);
    assert.deepEqual(failureResult, { fetched: 1, processed: 0, skipped: 0, failed: 1, retried: 0 });
    assert.equal((await backend.getByCustomer("customer-1")).find((record) => record.id === failed.id)?.billingStatus, BillingStatus.failed);

    await service.charge("customer-1", "units", "10", backend);
    await service.refund("customer-1", "units", "10", backend);
    const snapshot = await getUsageSnapshot("customer-1", ["units"], backend, new Date("2026-08-20T00:00:00Z"));
    assert.deepEqual(snapshot, { period: "2026-08", metrics: { units: { used: 16, total: 210 } } });
    assert.equal((await backend.getUsageSummary("customer-1"))[0]?.usageCount, 3);
    assert.equal(backend.transactionCount(), 5);

    const reopened = new SqliteBillingBackend(filename);
    try {
      assert.equal((await reopened.getAssetAmount("customer-1", "units"))?.toString(), "194");
      assert.equal(reopened.transactionCount(), 5);
    } finally {
      reopened.close();
    }
  } finally {
    backend.rollback();
    backend.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
