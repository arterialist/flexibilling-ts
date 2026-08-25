# Framework integrations

The package has no required web framework. Bind billing to the host request
layer explicitly.

## Request boundary

Resolve the customer from authenticated request state, check the cache or
repository before expensive work, then open a usage session around the
operation:

```ts
app.post("/reports", async (request) => {
  const customerId = request.auth.customerId;
  await requireBalance(customerId, ["units"], cache, repository);

  return withUsageSession(
    {
      customerId,
      service: "report_generation",
      usageRepository,
      referenceId: request.id,
    },
    async (usage) => {
      const report = await generateReport(request.body);
      usage.report({ units: report.units, durationSeconds: report.seconds });
      return report;
    },
  );
});
```

The host decides how an insufficient-balance error becomes an HTTP 402 or a
domain-specific response.

## Request wrappers

JavaScript decorators are not required. Wrap an operation in a small function
that calls `requireBalance`, `BillingService.charge`, or
`withUsageSession`. This keeps the integration compatible with Express, Fastify,
Hono, Next.js, and worker runtimes.

## Background worker

`BillingWorker` drains pending records from `BillingRepository`:

```ts
const worker = new BillingWorker(service, repository, 50);

await worker.runOnce();
```

Call `worker.run()` for a long-lived poller and stop it during application
shutdown. The host repository must make record claiming and balance updates
safe under concurrent workers.

## Metrics

The package does not register a metrics library. Count processed, skipped, and
failed records at the worker boundary and export them through the host's
OpenTelemetry, Prometheus, or logging integration.
