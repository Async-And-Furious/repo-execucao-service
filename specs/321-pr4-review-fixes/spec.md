# PR #4 review fixes (#321)

| Review finding | Test | Implementation |
|---|---|---|
| [Stale-entity transition race](https://github.com/Async-And-Furious/repo-execucao-service/pull/4#discussion_r4447971711) | `src/modules/execucao/application/use-cases/execucao.use-cases.spec.ts` | `src/modules/execucao/application/use-cases/execucao.use-cases.ts`, repository port/adapter |
| [CAS winner and aggregate guards](https://github.com/Async-And-Furious/repo-execucao-service/pull/4#issuecomment-6584506508) | same use-case spec | same use-case/repository files |
| [Short retry delay](https://github.com/Async-And-Furious/repo-execucao-service/pull/4#discussion_r4447971691) | `test/retry-policy.spec.ts`, `test/kafka-saga-event.consumer.spec.ts` | `src/modules/execucao/infrastructure/consumers/kafka-saga-event.consumer.ts` |
| [Missing-execution and CAS-loser classification](https://github.com/Async-And-Furious/repo-execucao-service/pull/4#issuecomment-6584506508) | `test/saga-event.handler.spec.ts` | `src/modules/execucao/application/use-cases/saga-event.handler.ts` |
| [Main-topic offset reset](https://github.com/Async-And-Furious/repo-execucao-service/pull/4#discussion_r4447971705) | `test/kafka-saga-event.consumer.spec.ts` | consumer subscriptions |
| [Published timestamp and failure logging](https://github.com/Async-And-Furious/repo-execucao-service/pull/4#discussion_r4447971711) | `test/kafka-execucao-event.publisher.spec.ts` | `src/modules/execucao/infrastructure/publishers/kafka-execucao-event.publisher.ts` |
| [Legacy ProcessedEvent disposition](https://github.com/Async-And-Furious/repo-execucao-service/pull/4#issuecomment-6584506508) | `test/processed-events-migration.spec.ts` plus disposable PostgreSQL | Prisma schema, new migration only |

User explicitly authorized adding a guarded migration to remove `processed_events` only when empty; do not modify the applied initial migration. The migration must take an exclusive table lock, abort clearly if rows exist, avoid CASCADE, and safely no-op if absent. Remove the Prisma model. Authorization is to create the migration only, not apply it to HML/production; run against a disposable database only if safely available.

After a database transition commits but Kafka publication fails, the publisher logs the order ID, event type and correlation ID and rethrows. Kafka replay cannot recover an event that was never published. The service currently has no webhook recovery endpoint; manual status reconciliation is not claimed as automated recovery.

DLT-to-Saga-failure conversion remains outside this issue.
