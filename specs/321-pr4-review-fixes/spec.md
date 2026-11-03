# PR #4 review fixes (#321)

| Review finding                                                               | Test                                                                              | Implementation                                                                              |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Aggregate mutation before conditional persistence prevents stale-entity race | `src/modules/execucao/application/use-cases/execucao.use-cases.spec.ts`            | `src/modules/execucao/application/use-cases/execucao.use-cases.ts`, repository port/adapter |
| CAS loser never publishes; all transitions use aggregate guards              | same use-case spec                                                                | same use-case/repository files                                                              |
| Retry waits heartbeat, preserves retry payload, safe offset handling         | `test/retry-policy.spec.ts`, `test/kafka-saga-event.consumer.spec.ts`             | `src/modules/execucao/infrastructure/consumers/kafka-saga-event.consumer.ts`                |
| Missing execution failure events ignored; CAS loser is re-read/classified     | `test/saga-event.handler.spec.ts`                                                 | `src/modules/execucao/application/use-cases/saga-event.handler.ts`                          |
| Main Kafka topics start from beginning, existing offsets preserved           | `test/kafka-saga-event.consumer.spec.ts`                                          | consumer subscriptions                                                                      |
| Published envelope uses transition timestamp; failed publish is observable   | `test/kafka-execucao-event.publisher.spec.ts`                                     | `src/modules/execucao/infrastructure/publishers/kafka-execucao-event.publisher.ts`          |
| Empty-only legacy table removal                                              | `test/processed-events-migration.spec.ts` plus disposable PostgreSQL if available | Prisma schema, new migration only                                                           |

User explicitly authorized adding a guarded migration to remove `processed_events` only when empty; do not modify the applied initial migration. The migration must take an exclusive table lock, abort clearly if rows exist, avoid CASCADE, and safely no-op if absent. Remove the Prisma model. Authorization is to create the migration only, not apply it to HML/production; run against a disposable database only if safely available.

After a database transition commits but Kafka publication fails, the publisher logs the order ID, event type and correlation ID and rethrows. Kafka replay cannot recover an event that was never published. The service currently has no webhook recovery endpoint; manual status reconciliation is not claimed as automated recovery.

DLT-to-Saga-failure conversion remains outside this issue.
