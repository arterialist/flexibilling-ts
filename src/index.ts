import Decimal from "decimal.js";

export type AmountInput = Decimal.Value;
export type CustomerId = string;
export type RecordId = string;
export type AssetName = string;
export type ServiceName = string;
export type Metadata = Record<string, unknown>;

export const AssetType = {
  units: "units",
  prepaidUnits: "prepaid_units",
  credits: "credits",
} as const;
export type AssetType = (typeof AssetType)[keyof typeof AssetType];

export const TransactionType = {
  usage: "usage",
  topUp: "top_up",
  monthlyGrant: "monthly_grant",
  expiration: "expiration",
  refund: "refund",
} as const;
export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];

export const MetricType = {
  fixed: "fixed",
  quantity: "quantity",
  duration: "duration",
  units: "units",
} as const;
export type MetricType = (typeof MetricType)[keyof typeof MetricType];

export const BillingProductStrategy = {
  topUp: "top_up",
  monthlyQuota: "monthly_quota",
} as const;
export type BillingProductStrategy =
  (typeof BillingProductStrategy)[keyof typeof BillingProductStrategy];

export const UsageService = {
  apiRequest: "api_request",
  backgroundTask: "background_task",
  dataExport: "data_export",
} as const;
export type UsageService = (typeof UsageService)[keyof typeof UsageService];

export const BillingStatus = {
  pending: "pending",
  processed: "processed",
  failed: "failed",
  skipped: "skipped",
} as const;
export type BillingStatus = (typeof BillingStatus)[keyof typeof BillingStatus];

export type Amount = Decimal;

export function decimal(value: AmountInput): Decimal {
  return Decimal.isDecimal(value) ? value : new Decimal(value);
}

export function decimalString(value: AmountInput): string {
  return decimal(value).toString();
}

export interface CustomerBalance {
  customerId: CustomerId;
  assetType: AssetName;
  amount: AmountInput;
  id?: RecordId;
}

export interface BalanceTransaction {
  customerId: CustomerId;
  assetType: AssetName;
  amount: AmountInput;
  balanceAfter: AmountInput;
  transactionType: TransactionType | string;
  id?: RecordId;
  sourceUsageId?: RecordId;
  paymentReference?: string;
  description?: string;
  createdAt?: Date;
}

export interface BillingRule {
  service: ServiceName;
  targetAsset: AssetName;
  metricType: MetricType | string;
  conversionRate?: AmountInput;
  priority?: number;
  filterCondition?: Metadata;
  refundServiceType?: ServiceName;
  isActive?: boolean;
  id?: RecordId;
}

export interface BillingProduct {
  externalProductId: string;
  assetType: AssetName;
  amount: AmountInput;
  strategy?: BillingProductStrategy | string;
  description?: string;
  isActive?: boolean;
  id?: RecordId;
}

export interface UsageRecord {
  customerId: CustomerId;
  service: ServiceName;
  variant?: string;
  id?: RecordId;
  referenceId?: RecordId;
  quantity?: AmountInput;
  durationSeconds?: AmountInput;
  units?: number;
  inputUnits?: number;
  outputUnits?: number;
  cachedUnits?: number;
  billingStatus?: BillingStatus | string;
  billingErrorMessage?: string;
  eventMetadata?: Metadata;
  createdAt?: Date;
}

export interface UsageRecordCreate extends Omit<UsageRecord, "id" | "billingStatus"> {
  billingStatus?: BillingStatus | string;
}

export interface BalanceTransactionCreate
  extends Omit<BalanceTransaction, "id" | "createdAt"> {}

export interface UsageSummary {
  service: ServiceName;
  variant: string;
  usageCount: number;
  totalQuantity?: number;
  totalDurationSeconds?: number;
  totalUnits?: number;
  totalInputUnits?: number;
  totalOutputUnits?: number;
  totalCachedUnits?: number;
}

export interface BillingStats {
  usageCount?: number;
  quantity?: number;
  spend?: number;
  custom?: Record<string, number>;
}

export interface ActivityEvent {
  time: string;
  action: string;
  cost: string;
  result: string;
}

export interface BillingRepository {
  getActiveRules(service: ServiceName, session?: unknown): Promise<BillingRule[]>;
  getCustomerBalances(customerId: CustomerId, session?: unknown): Promise<CustomerBalance[]>;
  upsertBalance(
    customerId: CustomerId,
    assetType: AssetName,
    amount: AmountInput,
    session?: unknown,
  ): Promise<CustomerBalance | AmountInput>;
  decrementBalance(
    customerId: CustomerId,
    assetType: AssetName,
    deduction: AmountInput,
    session?: unknown,
  ): Promise<AmountInput>;
  incrementBalance(
    customerId: CustomerId,
    assetType: AssetName,
    addition: AmountInput,
    session?: unknown,
  ): Promise<AmountInput>;
  createTransaction(
    data: BalanceTransactionCreate,
    session?: unknown,
  ): Promise<BalanceTransaction>;
  getTransactionForUsage(
    referenceId: RecordId,
    service: ServiceName,
    customerId: CustomerId,
    session?: unknown,
  ): Promise<BalanceTransaction | undefined>;
  getTransactionByReference(
    paymentReference: string,
    session?: unknown,
  ): Promise<BalanceTransaction | undefined>;
  getProductsForExternalIds(
    externalProductIds: string[],
    session?: unknown,
  ): Promise<BillingProduct[]>;
  getPendingRecords(limit: number, session?: unknown): Promise<UsageRecord[]>;
  markRecordProcessed(recordId: RecordId, session?: unknown): Promise<void>;
  markRecordFailed(recordId: RecordId, message: string, session?: unknown): Promise<void>;
  markRecordSkipped(recordId: RecordId, session?: unknown): Promise<void>;
}

export interface UsageRepository {
  create(data: UsageRecordCreate, session?: unknown): Promise<UsageRecord | undefined>;
  getByCustomer(customerId: CustomerId, skip?: number, limit?: number): Promise<UsageRecord[]>;
  getUsageSummary(
    customerId: CustomerId,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<UsageSummary[]>;
  getUsageRecords(
    customerId: CustomerId,
    fromDate?: Date,
    toDate?: Date,
    service?: ServiceName,
    limit?: number,
    offset?: number,
  ): Promise<{ records: UsageRecord[]; total: number }>;
}

export interface BillingCache {
  setBalances(customerId: CustomerId, balances: Record<AssetName, AmountInput>): Promise<void>;
  updateSingleBalance(
    customerId: CustomerId,
    assetType: AssetName,
    amount: AmountInput,
  ): Promise<void>;
  getBalances(customerId: CustomerId): Promise<Record<string, string>>;
  canTransact(customerId: CustomerId): Promise<boolean>;
  getAssetAmount(customerId: CustomerId, assetType: AssetName): Promise<Amount | undefined>;
  deleteBalances(customerId: CustomerId): Promise<void>;
  incrementStats(customerId: CustomerId, month: string, stats: BillingStats): Promise<void>;
  getStats(customerId: CustomerId, month: string): Promise<Record<string, string>>;
  pushFeedEvent(
    customerId: CustomerId,
    event: Omit<ActivityEvent, "time"> & { time?: Date | string },
  ): Promise<void>;
  getFeed(customerId: CustomerId, limit?: number): Promise<ActivityEvent[]>;
  deleteCustomerCache(customerId: CustomerId): Promise<void>;
}

export class BillingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InsufficientFundsError extends BillingError {
  readonly customerId: CustomerId;
  readonly service: ServiceName;

  constructor(customerId: CustomerId, service: ServiceName) {
    super(`Customer ${customerId} has insufficient funds for service '${service}'`);
    this.customerId = customerId;
    this.service = service;
  }
}

export class NoBillableUsageError extends BillingError {
  readonly customerId: CustomerId;
  readonly service: ServiceName;

  constructor(customerId: CustomerId, service: ServiceName) {
    super(`No billable usage for customer ${customerId} service '${service}'`);
    this.customerId = customerId;
    this.service = service;
  }
}

export class RuleNotFoundError extends BillingError {
  readonly service: ServiceName;

  constructor(service: ServiceName) {
    super(`No active billing rules found for service '${service}'`);
    this.service = service;
  }
}

export class GatekeeperDeniedError extends BillingError {
  readonly customerId: CustomerId;

  constructor(customerId: CustomerId) {
    super(`Gatekeeper denied: customer ${customerId} cannot transact`);
    this.customerId = customerId;
  }
}

export class BillingConfigurationError extends BillingError {}
export class BillingContextError extends BillingError {}

export class RatingEngine {
  static calculateCost(rule: BillingRule, record: UsageRecord): Decimal {
    const rate = decimal(rule.conversionRate ?? "1");
    switch (rule.metricType) {
      case MetricType.fixed:
        return rate;
      case MetricType.quantity:
        return decimal(record.quantity ?? "0").mul(rate);
      case MetricType.duration:
        return decimal(extractDuration(record)).mul(rate);
      case MetricType.units:
        return decimal(extractUnits(record)).mul(rate);
      default:
        throw new Error(`Unknown metric type: ${rule.metricType}`);
    }
  }

  static matchesFilter(rule: BillingRule, metadata?: Metadata): boolean {
    const condition = rule.filterCondition;
    if (!condition || Object.keys(condition).length === 0) return true;
    if (!metadata) return false;
    return Object.entries(condition).every(
      ([key, expected]) => resolveDottedKey(metadata, key) === expected,
    );
  }
}

export function resolveDottedKey(metadata: Metadata, key: string): unknown {
  let current: unknown = metadata;
  for (const part of key.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Metadata)[part];
  }
  return current;
}

function extractDuration(record: UsageRecord): AmountInput {
  const metadataValue = record.eventMetadata?.duration_seconds;
  return metadataValue !== undefined ? metadataValue as AmountInput : record.durationSeconds ?? "0";
}

function extractUnits(record: UsageRecord): number {
  if (record.units !== undefined) return record.units;
  return (record.inputUnits ?? 0) + (record.outputUnits ?? 0);
}

export interface WaterfallResult {
  assetType: AssetName;
  amount: Decimal;
  rule: BillingRule;
  refundServiceType?: ServiceName;
}

export class WaterfallEngine {
  evaluate(
    rules: BillingRule[],
    record: UsageRecord,
    balances: Record<string, AmountInput>,
  ): WaterfallResult {
    if (rules.length === 0) throw new RuleNotFoundError(record.service);
    let sawPositiveCost = false;
    const ordered = [...rules].filter((rule) => rule.isActive !== false).sort(
      (left, right) => (left.priority ?? 100) - (right.priority ?? 100),
    );
    for (const rule of ordered) {
      if (!RatingEngine.matchesFilter(rule, record.eventMetadata)) continue;
      const cost = RatingEngine.calculateCost(rule, record);
      if (cost.lte(0)) continue;
      sawPositiveCost = true;
      const available = decimal(balances[rule.targetAsset] ?? "0");
      if (available.gte(cost)) {
        return {
          assetType: rule.targetAsset,
          amount: cost,
          rule,
          refundServiceType: rule.refundServiceType,
        };
      }
    }
    if (!sawPositiveCost) throw new NoBillableUsageError(record.customerId, record.service);
    throw new InsufficientFundsError(record.customerId, record.service);
  }
}

export class InMemoryBillingRepository implements BillingRepository, UsageRepository {
  readonly rules: BillingRule[];
  readonly products: BillingProduct[];
  readonly records: UsageRecord[];
  readonly transactions: BalanceTransaction[] = [];
  private readonly balances = new Map<string, Decimal>();
  private nextTransactionId = 1;

  constructor(options: {
    rules?: BillingRule[];
    products?: BillingProduct[];
    records?: UsageRecord[];
  } = {}) {
    this.rules = [...(options.rules ?? [])];
    this.products = [...(options.products ?? [])];
    this.records = [...(options.records ?? [])];
  }

  async getActiveRules(service: ServiceName): Promise<BillingRule[]> {
    return this.rules
      .filter((rule) => rule.isActive !== false && rule.service === service)
      .sort((left, right) => (left.priority ?? 100) - (right.priority ?? 100));
  }

  async getCustomerBalances(customerId: CustomerId): Promise<CustomerBalance[]> {
    const prefix = `${customerId}:`;
    return [...this.balances.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => ({
        customerId,
        assetType: key.slice(prefix.length),
        amount: value,
      }));
  }

  async upsertBalance(
    customerId: CustomerId,
    assetType: AssetName,
    value: AmountInput,
  ): Promise<CustomerBalance> {
    const current = decimal(value);
    this.balances.set(balanceKey(customerId, assetType), current);
    return { customerId, assetType, amount: current };
  }

  async decrementBalance(
    customerId: CustomerId,
    assetType: AssetName,
    deduction: AmountInput,
  ): Promise<Decimal> {
    const key = balanceKey(customerId, assetType);
    const current = this.balances.get(key) ?? decimal("0");
    const amount = decimal(deduction);
    if (current.lt(amount)) throw new InsufficientFundsError(customerId, "charge");
    const next = current.sub(amount);
    this.balances.set(key, next);
    return next;
  }

  async incrementBalance(
    customerId: CustomerId,
    assetType: AssetName,
    addition: AmountInput,
  ): Promise<Decimal> {
    const key = balanceKey(customerId, assetType);
    const next = (this.balances.get(key) ?? decimal("0")).add(decimal(addition));
    this.balances.set(key, next);
    return next;
  }

  async createTransaction(data: BalanceTransactionCreate): Promise<BalanceTransaction> {
    const transaction: BalanceTransaction = {
      ...data,
      id: String(this.nextTransactionId++),
      createdAt: new Date(),
    };
    this.transactions.push(transaction);
    return transaction;
  }

  async getTransactionForUsage(
    referenceId: RecordId,
    service: ServiceName,
    customerId: CustomerId,
  ): Promise<BalanceTransaction | undefined> {
    const recordIds = new Set(
      this.records
        .filter((record) => record.referenceId === referenceId && record.service === service)
        .map((record) => record.id),
    );
    return [...this.transactions].reverse().find(
      (transaction) =>
        transaction.sourceUsageId !== undefined &&
        recordIds.has(transaction.sourceUsageId) &&
        transaction.customerId === customerId &&
        transaction.transactionType === TransactionType.usage,
    );
  }

  async getTransactionByReference(paymentReference: string): Promise<BalanceTransaction | undefined> {
    return this.transactions.find((transaction) => transaction.paymentReference === paymentReference);
  }

  async getProductsForExternalIds(externalProductIds: string[]): Promise<BillingProduct[]> {
    const wanted = new Set(externalProductIds);
    return this.products.filter(
      (product) => product.isActive !== false && wanted.has(product.externalProductId),
    );
  }

  async getPendingRecords(limit: number): Promise<UsageRecord[]> {
    return this.records
      .filter((record) => (record.billingStatus ?? BillingStatus.pending) === BillingStatus.pending)
      .slice(0, limit);
  }

  async markRecordProcessed(recordId: RecordId): Promise<void> {
    this.getRecord(recordId).billingStatus = BillingStatus.processed;
  }

  async markRecordFailed(recordId: RecordId, message: string): Promise<void> {
    const record = this.getRecord(recordId);
    record.billingStatus = BillingStatus.failed;
    record.billingErrorMessage = message;
  }

  async markRecordSkipped(recordId: RecordId): Promise<void> {
    this.getRecord(recordId).billingStatus = BillingStatus.skipped;
  }

  async create(data: UsageRecordCreate): Promise<UsageRecord> {
    const record: UsageRecord = {
      ...data,
      id: crypto.randomUUID(),
      variant: data.variant ?? "default",
      billingStatus: data.billingStatus ?? BillingStatus.pending,
      createdAt: data.createdAt ?? new Date(),
    };
    this.records.push(record);
    return record;
  }

  async getByCustomer(customerId: CustomerId, skip = 0, limit = 100): Promise<UsageRecord[]> {
    return this.records
      .filter((record) => record.customerId === customerId)
      .sort((left, right) => (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0))
      .slice(skip, skip + limit);
  }

  async getUsageSummary(
    customerId: CustomerId,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<UsageSummary[]> {
    const grouped = new Map<string, UsageRecord[]>();
    for (const record of this.filteredRecords(customerId, fromDate, toDate)) {
      const key = `${record.service}\u0000${record.variant ?? "default"}`;
      grouped.set(key, [...(grouped.get(key) ?? []), record]);
    }
    return [...grouped.entries()].map(([key, records]) => {
      const [service = "", variant = "default"] = key.split("\u0000");
      return {
        service,
        variant,
        usageCount: records.length,
        totalQuantity: sumDecimal(records.map((record) => record.quantity)),
        totalDurationSeconds: sumDecimal(records.map((record) => record.durationSeconds)),
        totalUnits: sumInteger(records.map((record) => record.units)),
        totalInputUnits: sumInteger(records.map((record) => record.inputUnits)),
        totalOutputUnits: sumInteger(records.map((record) => record.outputUnits)),
        totalCachedUnits: sumInteger(records.map((record) => record.cachedUnits)),
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
    const records = this.filteredRecords(customerId, fromDate, toDate, service).sort(
      (left, right) => (right.createdAt?.getTime() ?? 0) - (left.createdAt?.getTime() ?? 0),
    );
    return { records: records.slice(offset, offset + limit), total: records.length };
  }

  private filteredRecords(
    customerId: CustomerId,
    fromDate?: Date,
    toDate?: Date,
    service?: ServiceName,
  ): UsageRecord[] {
    return this.records.filter((record) => {
      if (record.customerId !== customerId || (service && record.service !== service)) return false;
      const timestamp = record.createdAt?.getTime();
      if (fromDate && (timestamp === undefined || timestamp < fromDate.getTime())) return false;
      if (toDate && (timestamp === undefined || timestamp > toDate.getTime())) return false;
      return true;
    });
  }

  private getRecord(recordId: RecordId): UsageRecord {
    const record = this.records.find((candidate) => candidate.id === recordId);
    if (!record) throw new Error(`Unknown usage record: ${recordId}`);
    return record;
  }
}

export class InMemoryUsageRepository extends InMemoryBillingRepository {}

export class InMemoryBillingCache implements BillingCache {
  private readonly balances = new Map<string, Record<string, string>>();
  private readonly stats = new Map<string, Record<string, string>>();
  private readonly feed = new Map<string, ActivityEvent[]>();

  async setBalances(customerId: CustomerId, values: Record<AssetName, AmountInput>): Promise<void> {
    const balances: Record<string, string> = {};
    for (const [asset, value] of Object.entries(values)) balances[asset] = decimalString(value);
    balances.can_transact = Object.values(values).some((value) => decimal(value).gt(0)) ? "1" : "0";
    this.balances.set(customerId, balances);
  }

  async updateSingleBalance(customerId: CustomerId, assetType: AssetName, value: AmountInput): Promise<void> {
    const balances = this.balances.get(customerId) ?? {};
    balances[assetType] = decimalString(value);
    balances.can_transact = Object.entries(balances).some(
      ([asset, amount]) => asset !== "can_transact" && decimal(amount).gt(0),
    ) ? "1" : "0";
    this.balances.set(customerId, balances);
  }

  async getBalances(customerId: CustomerId): Promise<Record<string, string>> {
    return { ...(this.balances.get(customerId) ?? {}) };
  }

  async canTransact(customerId: CustomerId): Promise<boolean> {
    return this.balances.get(customerId)?.can_transact === "1";
  }

  async getAssetAmount(customerId: CustomerId, assetType: AssetName): Promise<Decimal | undefined> {
    const value = this.balances.get(customerId)?.[assetType];
    return value === undefined ? undefined : decimal(value);
  }

  async deleteBalances(customerId: CustomerId): Promise<void> {
    this.balances.delete(customerId);
  }

  async incrementStats(customerId: CustomerId, month: string, stats: BillingStats): Promise<void> {
    const key = `${customerId}:${month}`;
    const current = this.stats.get(key) ?? {};
    if (stats.usageCount) current.total_usage_count = addDecimal(current.total_usage_count, stats.usageCount);
    if (stats.quantity) current.total_quantity = addDecimal(current.total_quantity, stats.quantity);
    if (stats.spend) current.total_spend = addDecimal(current.total_spend, stats.spend);
    for (const [name, value] of Object.entries(stats.custom ?? {})) {
      current[`total_custom:${name}`] = addDecimal(current[`total_custom:${name}`], value);
    }
    this.stats.set(key, current);
  }

  async getStats(customerId: CustomerId, month: string): Promise<Record<string, string>> {
    return { ...(this.stats.get(`${customerId}:${month}`) ?? {}) };
  }

  async pushFeedEvent(
    customerId: CustomerId,
    event: Omit<ActivityEvent, "time"> & { time?: Date | string },
  ): Promise<void> {
    const time = event.time instanceof Date
      ? event.time.toISOString()
      : event.time ?? new Date().toISOString();
    const values = this.feed.get(customerId) ?? [];
    values.unshift({ time, action: event.action, cost: event.cost, result: event.result });
    this.feed.set(customerId, values.slice(0, 50));
  }

  async getFeed(customerId: CustomerId, limit = 20): Promise<ActivityEvent[]> {
    return (this.feed.get(customerId) ?? []).slice(0, limit).map((event) => ({ ...event }));
  }

  async deleteCustomerCache(customerId: CustomerId): Promise<void> {
    this.balances.delete(customerId);
    this.feed.delete(customerId);
    for (const key of this.stats.keys()) if (key.startsWith(`${customerId}:`)) this.stats.delete(key);
  }
}

export class NullBillingCache extends InMemoryBillingCache {
  async setBalances(): Promise<void> {}
  async updateSingleBalance(): Promise<void> {}
  async getBalances(): Promise<Record<string, string>> { return {}; }
  async canTransact(): Promise<boolean> { return false; }
  async getAssetAmount(): Promise<undefined> { return undefined; }
  async deleteBalances(): Promise<void> {}
  async incrementStats(): Promise<void> {}
  async getStats(): Promise<Record<string, string>> { return {}; }
  async pushFeedEvent(): Promise<void> {}
  async getFeed(): Promise<ActivityEvent[]> { return []; }
  async deleteCustomerCache(): Promise<void> {}
}

export class Gatekeeper {
  constructor(private readonly cache: BillingCache) {}

  async check(customerId: CustomerId): Promise<boolean> {
    const balances = await this.cache.getBalances(customerId);
    if (Object.keys(balances).length === 0 || !(await this.cache.canTransact(customerId))) {
      throw new GatekeeperDeniedError(customerId);
    }
    return true;
  }

  async checkSilent(customerId: CustomerId): Promise<boolean> {
    try {
      return await this.check(customerId);
    } catch (error) {
      if (error instanceof GatekeeperDeniedError) return false;
      throw error;
    }
  }
}

export class BillingService {
  private readonly waterfall = new WaterfallEngine();
  private readonly gatekeeper: Gatekeeper;
  private readonly clock: () => Date;

  constructor(
    readonly repo: BillingRepository,
    readonly cache: BillingCache,
    options: { gatekeeper?: Gatekeeper; clock?: () => Date } = {},
  ) {
    this.gatekeeper = options.gatekeeper ?? new Gatekeeper(cache);
    this.clock = options.clock ?? (() => new Date());
  }

  async processRecord(record: UsageRecord, session?: unknown): Promise<void> {
    const rules = await this.repo.getActiveRules(record.service, session);
    const rows = await this.repo.getCustomerBalances(record.customerId, session);
    const balances: Record<string, AmountInput> = {};
    for (const row of rows) balances[row.assetType] = row.amount;
    const result = this.waterfall.evaluate(rules, record, balances);
    const newAmount = decimal(await this.repo.decrementBalance(
      record.customerId, result.assetType, result.amount, session,
    ));
    await this.repo.createTransaction({
      customerId: record.customerId,
      assetType: result.assetType,
      amount: result.amount.negated(),
      balanceAfter: newAmount,
      transactionType: TransactionType.usage,
      sourceUsageId: record.id,
      description: `${record.service} usage: -${result.amount.toString()} ${result.assetType}`,
    }, session);
    if (result.refundServiceType && record.referenceId !== undefined) {
      await this.handleRefund(record, result.refundServiceType, session);
    }
    if (!record.id) throw new BillingConfigurationError("A usage record must have an id before it can be processed");
    await this.repo.markRecordProcessed(record.id, session);
    await this.syncCache(record, result, newAmount);
  }

  async checkPermission(customerId: CustomerId): Promise<boolean> {
    return this.gatekeeper.check(customerId);
  }

  async checkPermissionSilent(customerId: CustomerId): Promise<boolean> {
    return this.gatekeeper.checkSilent(customerId);
  }

  async refreshCustomerBalanceCache(customerId: CustomerId, session?: unknown): Promise<void> {
    const rows = await this.repo.getCustomerBalances(customerId, session);
    if (rows.length === 0) return this.cache.deleteBalances(customerId);
    const balances: Record<string, AmountInput> = {};
    for (const row of rows) balances[row.assetType] = row.amount;
    await this.cache.setBalances(customerId, balances);
  }

  async fundCustomer(
    customerId: CustomerId,
    productIds: string[],
    paymentReference: string,
    session?: unknown,
  ): Promise<boolean> {
    if (await this.repo.getTransactionByReference(paymentReference, session)) return false;
    const products = await this.repo.getProductsForExternalIds(productIds, session);
    if (products.length === 0) return false;
    for (const product of products) {
      const strategy = product.strategy ?? BillingProductStrategy.topUp;
      let newAmount: Decimal;
      let transactionType: string;
      let description: string;
      if (strategy === BillingProductStrategy.topUp) {
        newAmount = decimal(await this.repo.incrementBalance(customerId, product.assetType, product.amount, session));
        transactionType = TransactionType.topUp;
        description = `Top-up: +${decimalString(product.amount)} ${product.assetType} (product: ${product.externalProductId})`;
      } else if (strategy === BillingProductStrategy.monthlyQuota) {
        const upserted = await this.repo.upsertBalance(customerId, product.assetType, product.amount, session);
        newAmount = decimal(isCustomerBalance(upserted) ? upserted.amount : upserted);
        transactionType = TransactionType.monthlyGrant;
        description = `Monthly quota reset: ${decimalString(product.amount)} ${product.assetType} (product: ${product.externalProductId})`;
      } else {
        throw new BillingConfigurationError(`Unknown billing product strategy: ${strategy}`);
      }
      await this.repo.createTransaction({
        customerId,
        assetType: product.assetType,
        amount: product.amount,
        balanceAfter: newAmount,
        transactionType,
        paymentReference,
        description,
      }, session);
      await this.cache.updateSingleBalance(customerId, product.assetType, newAmount);
    }
    return true;
  }

  async charge(
    customerId: CustomerId,
    assetType: AssetName,
    value: AmountInput,
    session?: unknown,
    description?: string,
  ): Promise<void> {
    const amount = decimal(value);
    if (amount.lte(0)) throw new Error("charge amount must be positive");
    const newBalance = await this.repo.decrementBalance(customerId, assetType, amount, session);
    await this.repo.createTransaction({
      customerId,
      assetType,
      amount: amount.negated(),
      balanceAfter: newBalance,
      transactionType: TransactionType.usage,
      description: description ?? `charge: ${assetType} x ${amount.toString()}`,
    }, session);
    await this.cache.updateSingleBalance(customerId, assetType, newBalance);
    await this.cache.incrementStats(customerId, this.month(), {
      usageCount: 1,
      quantity: amount.toNumber(),
      spend: amount.toNumber(),
      custom: { [`asset:${assetType}`]: amount.toNumber() },
    });
  }

  async refund(
    customerId: CustomerId,
    assetType: AssetName,
    value: AmountInput,
    session?: unknown,
    description?: string,
  ): Promise<void> {
    const amount = decimal(value);
    if (amount.lte(0)) throw new Error("refund amount must be positive");
    const newBalance = await this.repo.incrementBalance(customerId, assetType, amount, session);
    await this.repo.createTransaction({
      customerId,
      assetType,
      amount,
      balanceAfter: newBalance,
      transactionType: TransactionType.refund,
      description: description ?? `refund: ${assetType} x ${amount.toString()}`,
    }, session);
    await this.cache.updateSingleBalance(customerId, assetType, newBalance);
  }

  private async handleRefund(record: UsageRecord, service: ServiceName, session?: unknown): Promise<void> {
    if (!record.referenceId) return;
    const original = await this.repo.getTransactionForUsage(record.referenceId, service, record.customerId, session);
    if (!original) return;
    const refundAmount = decimal(original.amount).abs();
    const newAmount = await this.repo.incrementBalance(record.customerId, original.assetType, refundAmount, session);
    await this.repo.createTransaction({
      customerId: record.customerId,
      assetType: original.assetType,
      amount: refundAmount,
      balanceAfter: newAmount,
      transactionType: TransactionType.refund,
      sourceUsageId: record.id,
      description: `Refund for reference ${record.referenceId}: +${refundAmount.toString()} ${original.assetType}`,
    }, session);
    await this.cache.updateSingleBalance(record.customerId, original.assetType, newAmount);
  }

  private async syncCache(record: UsageRecord, result: WaterfallResult, newBalance: Decimal): Promise<void> {
    await this.cache.updateSingleBalance(record.customerId, result.assetType, newBalance);
    const amount = result.amount.toNumber();
    await this.cache.incrementStats(record.customerId, this.month(), {
      usageCount: 1,
      quantity: amount,
      spend: amount,
      custom: { [`asset:${result.assetType}`]: amount },
    });
    await this.cache.pushFeedEvent(record.customerId, {
      action: result.rule.service,
      cost: `${result.amount.toString()} ${result.assetType}`,
      result: "Success",
    });
  }

  private month(): string {
    const date = this.clock();
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }
}

export async function hasBalance(
  customerId: CustomerId,
  assetTypes: AssetName[],
  cache: BillingCache,
  repository?: BillingRepository,
): Promise<boolean> {
  let balances = await cache.getBalances(customerId);
  if (Object.keys(balances).length === 0 && repository) {
    const rows = await repository.getCustomerBalances(customerId);
    if (rows.length) {
      const values: Record<string, AmountInput> = {};
      for (const row of rows) values[row.assetType] = row.amount;
      await cache.setBalances(customerId, values);
      balances = await cache.getBalances(customerId);
    }
  }
  return assetTypes.reduce((sum, asset) => sum.add(decimal(balances[asset] ?? "0")), decimal("0")).gt(0);
}

export async function requireBalance(
  customerId: CustomerId,
  assetTypes: AssetName[],
  cache: BillingCache,
  repository?: BillingRepository,
): Promise<void> {
  if (!(await hasBalance(customerId, assetTypes, cache, repository))) {
    throw new GatekeeperDeniedError(customerId);
  }
}

export class UsageMetrics {
  quantity = decimal("0");
  durationSeconds = decimal("0");
  units = 0;
  inputUnits = 0;
  outputUnits = 0;
  cachedUnits = 0;
  events = 0;

  isEmpty(): boolean {
    return this.quantity.eq(0) && this.durationSeconds.eq(0) && this.units === 0 &&
      this.inputUnits === 0 && this.outputUnits === 0 && this.cachedUnits === 0 && this.events === 0;
  }
}

export class BillingContext {
  readonly metrics = new UsageMetrics();
  readonly metadata: Metadata;

  constructor(
    readonly customerId: CustomerId,
    readonly service?: ServiceName,
    readonly variant?: string,
    readonly referenceId?: RecordId,
    metadata?: Metadata,
  ) {
    this.metadata = { ...(metadata ?? {}) };
  }

  report(values: {
    quantity?: AmountInput;
    durationSeconds?: AmountInput;
    units?: number;
    inputUnits?: number;
    outputUnits?: number;
    cachedUnits?: number;
    events?: number;
  } = {}): void {
    this.metrics.quantity = this.metrics.quantity.add(values.quantity ?? "0");
    this.metrics.durationSeconds = this.metrics.durationSeconds.add(values.durationSeconds ?? "0");
    this.metrics.units += values.units ?? 0;
    this.metrics.inputUnits += values.inputUnits ?? 0;
    this.metrics.outputUnits += values.outputUnits ?? 0;
    this.metrics.cachedUnits += values.cachedUnits ?? 0;
    this.metrics.events += values.events ?? 0;
  }

  setMetadata(key: string, value: unknown): void {
    this.metadata[key] = value;
  }
}

export async function withUsageSession<T>(
  options: {
    customerId: CustomerId;
    service: ServiceName;
    usageRepository: UsageRepository;
    variant?: string;
    referenceId?: RecordId;
    metadata?: Metadata;
    writeOnException?: boolean;
  },
  operation: (context: BillingContext) => Promise<T> | T,
): Promise<T> {
  const context = new BillingContext(
    options.customerId,
    options.service,
    options.variant,
    options.referenceId,
    options.metadata,
  );
  let failed = false;
  try {
    return await operation(context);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    if (!context.metrics.isEmpty() && (!failed || options.writeOnException !== false)) {
      const metadata = { ...context.metadata };
      if (!context.metrics.durationSeconds.eq(0) && metadata.duration_seconds === undefined) {
        metadata.duration_seconds = context.metrics.durationSeconds.toNumber();
      }
      try {
        await options.usageRepository.create({
          customerId: context.customerId,
          service: options.service,
          variant: context.variant ?? "default",
          referenceId: context.referenceId,
          quantity: context.metrics.quantity.eq(0) ? undefined : context.metrics.quantity,
          durationSeconds: context.metrics.durationSeconds.eq(0) ? undefined : context.metrics.durationSeconds,
          units: context.metrics.units || undefined,
          inputUnits: context.metrics.inputUnits || undefined,
          outputUnits: context.metrics.outputUnits || undefined,
          cachedUnits: context.metrics.cachedUnits || undefined,
          eventMetadata: Object.keys(metadata).length ? metadata : undefined,
        });
      } catch {
        // Usage reporting is best effort at the request boundary.
      }
    }
  }
}

export interface WorkerCycleResult {
  fetched: number;
  processed: number;
  skipped: number;
  failed: number;
  retried: number;
}

export class BillingWorker {
  private running = false;

  constructor(
    private readonly service: BillingService,
    private readonly repo: BillingRepository,
    private readonly batchSize = 50,
  ) {}

  async runOnce(session?: unknown): Promise<WorkerCycleResult> {
    const records = await this.repo.getPendingRecords(this.batchSize, session);
    let processed = 0;
    let skipped = 0;
    let failed = 0;
    let retried = 0;
    for (const record of records) {
      try {
        await this.service.processRecord(record, session);
        processed++;
      } catch (error) {
        if (error instanceof NoBillableUsageError) {
          skipped++;
          if (record.id) await this.repo.markRecordSkipped(record.id, session);
        } else if (error instanceof InsufficientFundsError || error instanceof BillingError) {
          failed++;
          if (record.id) await this.repo.markRecordFailed(record.id, error.message, session);
        } else {
          retried++;
        }
      }
    }
    return { fetched: records.length, processed, skipped, failed, retried };
  }

  async run(intervalMs = 2000, session?: unknown): Promise<void> {
    this.running = true;
    while (this.running) {
      const result = await this.runOnce(session);
      if (result.fetched < this.batchSize) await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  stop(): void {
    this.running = false;
  }
}

export interface UsageMetric {
  used: number;
  total: number;
}

export interface UsageSnapshot {
  period: string;
  metrics: Record<string, UsageMetric>;
}

export async function getUsageSnapshot(
  customerId: CustomerId,
  assetTypes: AssetName[],
  cache: BillingCache,
  now = new Date(),
): Promise<UsageSnapshot> {
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const balances = await cache.getBalances(customerId);
  const stats = await cache.getStats(customerId, period);
  const metrics: Record<string, UsageMetric> = {};
  for (const asset of assetTypes) {
    const used = decimal(stats[`total_custom:asset:${asset}`] ?? "0");
    const remaining = Decimal.max(decimal(balances[asset] ?? "0"), decimal("0"));
    metrics[asset] = { used: used.toNumber(), total: used.add(remaining).toNumber() };
  }
  return { period, metrics };
}

function balanceKey(customerId: CustomerId, assetType: AssetName): string {
  return `${customerId}:${assetType}`;
}

function isCustomerBalance(value: CustomerBalance | AmountInput): value is CustomerBalance {
  return typeof value === "object" && value !== null && "amount" in value;
}

function addDecimal(current: string | undefined, value: number): string {
  return decimal(current ?? "0").add(value).toString();
}

function sumDecimal(values: (AmountInput | undefined)[]): number | undefined {
  const present = values.filter((value): value is AmountInput => value !== undefined);
  if (present.length === 0) return undefined;
  return present.reduce<Decimal>((sum, value) => sum.add(decimal(value)), decimal("0")).toNumber();
}

function sumInteger(values: (number | undefined)[]): number | undefined {
  const present = values.filter((value): value is number => value !== undefined);
  return present.length ? present.reduce((sum, value) => sum + value, 0) : undefined;
}
