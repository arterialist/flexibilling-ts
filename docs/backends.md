# Backend integration

FlexiBilling uses interfaces rather than a required database schema. Keep the
host's existing models and implement the methods in the repository ports.

## Ports

- `BillingRepository` handles rules, balances, products, ledger transactions, and queue status.
- `UsageRepository` handles session-created records and usage queries.
- `BillingCache` handles balance snapshots, period statistics, and activity events.
- `TransactionFactory` supplies a transaction for standalone charges and refunds.

Repository methods accept an optional `session` value. Pass a database
transaction or unit-of-work object from the host application.

## Minimal repository shape

```ts
class DatabaseRepository implements BillingRepository, UsageRepository {
  async getActiveRules(service: string, session?: unknown) {
    return this.db.rules.activeFor(service, session);
  }

  async getCustomerBalances(customerId: string, session?: unknown) {
    return this.db.balances.forCustomer(customerId, session);
  }

  async decrementBalance(
    customerId: string,
    assetType: string,
    deduction: AmountInput,
    session?: unknown,
  ) {
    return this.db.balances.decrement(customerId, assetType, deduction, session);
  }

  // Implement the remaining BillingRepository and UsageRepository methods.
}
```

This is only the shape of the example. TypeScript still checks the complete
port before the repository is passed to the service.

## In-memory adapters

`InMemoryBillingRepository` and `InMemoryBillingCache` are useful for tests,
examples, and local experiments. They do not persist across processes and do
not provide cross-process locking.

## SQL databases

The package does not choose a SQL client. Map the record fields directly to the
host schema. Store decimal amounts as exact decimal or numeric values. Store
`eventMetadata` as JSON when the database supports it, and index the customer,
status, service, and created-at fields used by the worker and usage queries.
