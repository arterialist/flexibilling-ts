# FlexiBilling for TypeScript

FlexiBilling is an asynchronous billing engine for TypeScript backends. It
manages named balances, rates usage, applies priority rules, records ledger
transactions, grants products idempotently, updates cache views, and processes
a pending usage queue.

The core package depends only on `decimal.js`. Storage, transactions, web
frameworks, caches, and payment providers stay in the host application.

## Install

```bash
npm install flexibilling
```

The package requires Node.js 22 or newer and builds with TypeScript 7.

## Guides

- [Quickstart](quickstart.md) creates rules, funds a customer, and processes usage.
- [Concepts](concepts.md) explains balances, metrics, rules, waterfalls, and ledger entries.
- [Backend integration](backends.md) shows the repository and cache ports.
- [Framework integrations](integrations.md) covers sessions, workers, and request boundaries.
- [Operations](operations.md) covers transactions, retries, cache behavior, and production checks.
- [Development and releases](development.md) covers local checks, CI, docs, and npm publishing.

## Design guarantees

1. Billing decisions do not depend on a storage provider.
2. Asset and service names are application-defined strings.
3. Decimal values are used for balances, rates, and ledger amounts.
4. Cache and observability failures do not change the billing decision.
5. A host owns the transaction used for balance deductions and ledger writes.
