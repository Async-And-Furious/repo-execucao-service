# repo-execucao-service

Servico de Execucao e Producao do Tech Challenge Fase 4 (FIAP 15SOAT). Feature #319 do repositorio `async-furious-project`.

Stack: NestJS 10, Prisma 5, PostgreSQL, Node 22, pnpm. Quatro camadas por modulo (`domain`, `application`, `infrastructure`, `presentation`) mais `shared/`.

## Origem

Scaffold **copiado** do OS Service, sem fork, sem pacote npm compartilhado e sem submodulo git. `processed_events` e legado, criado pela migration inicial historica; a nova migration remove a tabela somente quando vazia, sob lock exclusivo, e aborta se encontrar dados. A migration inicial nao foi alterada. A idempotencia da Saga depende dos estados atuais e da unicidade de `ordemServicoId`.

## Banco de dados

PostgreSQL, banco `execucao_producao`, role `execucao_app` na instancia RDS unica, com `connection_limit=3` no `DATABASE_URL`. O secret `tc3-db-execucao-<env>` e provisionado pelo Epic #312 (`repo-db-infra`). O servico nao acessa tabelas de outro servico.

**Este servico nao hospeda NoSQL.** "O Execucao era quem ia levar o NoSQL" foi hipotese de trabalho durante o planejamento e nao vale mais: a saga e coreografada (nao existe orquestrador) e o DocumentDB ganhou uso de negocio como read model de OS e Cliente dentro do OS Service, o que ja cumpre o requisito de NoSQL do enunciado. A fila e o ciclo de execucao cabem em PostgreSQL. Se o assunto voltar, a regra de convivencia seria a mesma do relacional: tabela propria por servico, IAM policy restrita a ela, nunca acesso cruzado.

## Estratégia de Saga

O fluxo de Ordem de Serviço é coordenado por uma Saga coreografada (ADR-0016): não há orquestrador nem chamadas REST entre microsserviços. Cada serviço publica e consome eventos Kafka com correlationId = ordemServicoId. Esta escolha reduz acoplamento síncrono, mas abre mão de uma visão central do estado da Saga e de um único ponto de timeout; cada serviço responde por suas transições, retries e compensações. Veja a [ADR-0016 — Saga coreografada](https://github.com/Async-And-Furious/async-furious-project/blob/develop/docs/adr/0016-saga-coreografada.md) e o [fluxo completo da Saga](https://github.com/Async-And-Furious/async-furious-project/blob/develop/docs/architecture/saga-flow.md).

## Autenticacao

`src/auth/` e a variante stateless do JWT local (ADR-0021): `JwtStrategy` valida localmente e devolve `{ id: sub, email, role }`, sem Prisma e sem `AuthService`. Token sem `role` vira `Role.CLIENTE` e recebe 403 em rota com `@Roles`. Role fora do enum e rejeitada com 401. O `sub` fica em `request.user.id`, via `@CurrentUser('id')`, e e gravado como `responsavelId` em `iniciar-diagnostico`.

Throttling usa `user:<id>` somente depois da autenticacao JWT; rotas `@Public` e JWTs invalidos usam `ip:<req.ip>`. `X-Forwarded-For` nao e confiavel: `trust proxy` nao esta habilitado, portanto trafego publico e invalido atras do mesmo proxy compartilha a cota IP do proxy.

## Rotas

Todas com `@Roles(Role.MECANICO)`. A `Execucao` nasce quando o servico consome `OrdemServicoRecebida` (Feature de Eventos); nao existe rota de criacao.

| Metodo | Rota | Efeito | Evento |
|---|---|---|---|
| `GET` | `/api/v1/execucoes?status=&responsavelId=` | Fila ordenada por `createdAt`. Sem `status`: `AGUARDANDO_DIAGNOSTICO` e `AGUARDANDO_REPARO` | |
| `PATCH` | `/api/v1/execucoes/{id}/iniciar-diagnostico` | `AGUARDANDO_DIAGNOSTICO` para `EM_DIAGNOSTICO`, grava `responsavelId` | `DiagnosticoIniciado` |
| `PATCH` | `/api/v1/execucoes/{id}/iniciar-reparo` | `AGUARDANDO_REPARO` para `EM_REPARO` | `ExecucaoIniciada` |
| `PATCH` | `/api/v1/execucoes/{id}/concluir` | `EM_REPARO` para `CONCLUIDA` | `ExecucaoConcluida` |

Transicao invalida responde 400; id inexistente, 404. As transicoes da API e da Saga usam updates condicionais no banco para evitar sobrescrita por leitura obsoleta. Eventos de saida sao publicados no Kafka depois do commit local.

## Seed

`prisma/seed.sql` cria 6 execucoes (uma por estado nao cancelado, mais uma segunda em `AGUARDANDO_DIAGNOSTICO`), com `responsavelId = mec-seed` onde ja houve diagnostico. Reexecutavel.

```bash
pnpm db:seed
```

Em HML, depois do migration Job:

```bash
kubectl -n execucao exec deploy/execucao-api -- node_modules/.bin/prisma db execute --file prisma/seed.sql --schema prisma/schema.prisma
```

## Rodando localmente

```bash
cp .env.example .env
docker compose -f docker-compose.dependencies.yml up -d
pnpm install
pnpm exec prisma migrate deploy
pnpm db:seed
NEW_RELIC_ENABLED=false NEW_RELIC_NO_CONFIG_FILE=true NEW_RELIC_LICENSE_KEY= \
  NEW_RELIC_LOG=stdout pnpm start
```

- Healthcheck: `/api/v1/health`, `/api/v1/health/live`, `/api/v1/health/ready`
- Swagger: `/api/docs/execucao` (em HML, `<ALB>/api/docs/execucao`)
- Contrato versionado: [`docs/openapi.json`](docs/openapi.json), gerado dos decorators por `pnpm openapi:export`. O workflow `OpenAPI` falha se o arquivo não bater com o código.

## Kubernetes

Manifests em `k8s/`: namespace `execucao`, Deployment, Service, migration Job, configmap e secret. Namespace, ECR proprio e banco/role sao provisionados pelo Epic #312. Workflows de CI/CD e protecao de branch ficam para a Feature de Testes e Pipeline.

## Recuperacao de publicacao da Saga

As transicoes sao persistidas com compare-and-swap antes da publicacao Kafka. Se o publish falhar depois do commit, o publisher registra `ordemServicoId`, `eventType` e `correlationId` e propaga o erro. Reprocessar Kafka nao recupera uma mensagem que nunca chegou ao broker.

Como fallback operacional do **OS Service** (nao deste servico), existe `POST /api/v1/webhooks/service-orders/status`. Ele exige o header `x-webhook-secret`, comparado em tempo constante com `WEBHOOK_SECRET`; segredo ausente ou divergente retorna 401. O corpo valida `osId` UUID, `status` e `motivo` opcional. O OS permite apenas: `RECEIVED` → `UNDER_DIAGNOSIS` ou `CLOSED_WITHOUT_EXECUTION`; `UNDER_DIAGNOSIS` → `AWAITING_APPROVAL` ou `CLOSED_WITHOUT_EXECUTION`; `AWAITING_APPROVAL` → `IN_PROGRESS` ou `CLOSED_WITHOUT_EXECUTION`; `IN_PROGRESS` → `AWAITING_PARTS` ou `FINISHED`; `AWAITING_PARTS` → `IN_PROGRESS`. O webhook rejeita `DELIVERED`; a entrega usa `registrar-entrega`. `DELIVERED` e `CLOSED_WITHOUT_EXECUTION` nao tem transicoes de saida. O endpoint altera status/historico da OS e emite somente os eventos normais das transicoes que os possuem. **Nao e webhook da Execucao:** nao republica evento Kafka perdido, nao altera automaticamente o estado da Execucao e nao garante a recuperacao da Saga inteira.

## Observabilidade — onboarding parcial (#343)

O agente `newrelic` 14.4.0 e carregado antes dos demais modulos, com configuracao
exclusivamente por ambiente (sem `newrelic.js` ou SDK OpenTelemetry). A identidade
HML deste servico e **`af-execucao-hml`**; o OS Service permanece
`async-furious-project-hml` e o Billing usa `af-billing-hml`. Nao adotamos labels
opcionais nem alteramos sampling neste incremento.

Fornecer estas variaveis **antes de iniciar o processo**: o `ConfigModule` le
`.env` depois do primeiro import e nao reconfigura o agente ja carregado.

| Variavel | HML | Local sem telemetria |
| --- | --- | --- |
| `NEW_RELIC_ENABLED` | default `true` | `false` |
| `NEW_RELIC_NO_CONFIG_FILE` | `true` | `true` |
| `NEW_RELIC_APP_NAME` | `af-execucao-hml` | `af-execucao-local` |
| `NEW_RELIC_LICENSE_KEY` | secret externo, nunca no ConfigMap | vazia |
| `NEW_RELIC_DISTRIBUTED_TRACING_ENABLED` | `true` | `true` |
| `NEW_RELIC_APPLICATION_LOGGING_ENABLED` | `true` | `true` |
| `NEW_RELIC_APPLICATION_LOGGING_LOCAL_DECORATING_ENABLED` | `true` | `true` |
| `NEW_RELIC_APPLICATION_LOGGING_FORWARDING_ENABLED` | `false` | `false` |
| `NEW_RELIC_LOG` | `stdout` | `stdout` |

O log do agente usa stdout para nao exigir escrita no container nao-root.
A feature flag `kafkajs_instrumentation` do agente fica desligada de proposito: na
versao 14.x, o wrapper do `eachMessage` nao devolve a promise do handler, e o kafkajs
confirmaria o offset antes do processamento. O trace pelo broker deve propagar os
headers no codigo (#344).
Forwarding pelo agente fica desligado para nao duplicar o envio pelo Fluent Bit.
O log tardio de "request completed" do pino-http pode nao carregar `trace.id`.
O trace comeca no primeiro servico: **API Gateway → Lambda/Authorizer nao e
coberto**. `trace.id` nao substitui o `correlationId=ordemServicoId` dos eventos.

Trace pelo Kafka (#344): a instrumentacao automatica do kafkajs fica desligada
(na 14.x o wrapper do `eachMessage` nao devolve a promise do handler e o offset
seria confirmado antes do processamento). O publicador grava `traceparent`,
`tracestate` e `newrelic` nos headers da mensagem, dentro da transacao ativa. O
consumidor abre uma background transaction `Kafka/<topico>` que aceita esses
headers e aguarda o processamento. Retry e DLT tambem levam os headers. A
transacao de consumo inclui a espera do retry (30 s e 60 s): a duracao no APM
nao e so o tempo de processamento. Sem agente ativo, as chamadas viram no-op.

Exemplo de teste local isolado, com Node 22 e pnpm 10.18.3, sem key ou servicos externos:

```bash
NEW_RELIC_ENABLED=false NEW_RELIC_NO_CONFIG_FILE=true NEW_RELIC_LICENSE_KEY= \
  pnpm exec jest --runInBand test/observability/newrelic-onboarding.spec.ts
```

Referencia documental do dashboard herdado: New Relic One →
`tc3-observability-hml`, mantido em `repo-k8s-infra`; ver
[ADR-0005](https://github.com/Async-And-Furious/async-furious-project/blob/develop/docs/adr/0005-observabilidade.md).
Nao houve consulta atual a esse dashboard nem validacao HML neste incremento.

**Entrega parcial de #343 — nao fecha a issue.** Ainda faltam onboarding do
Billing (sem base `develop`), distribuicao autorizada da key por secret de
organizacao (ou fallback aprovado com verificacao bloqueante antes do deploy),
injecao no container pela esteira de #328 e confirmacao das tres entidades APM.
O Deployment ja recebe `execucao-secret` por `envFrom`; este incremento nao
altera secrets ou workflows e nao esta pronto para aceite HML sem essa integracao.
Com #344/#337, validar um trace real OS → Kafka → Execucao por
`OrdemServicoRecebida` assim que o segundo servico estiver disponivel, com
evidencia na issue. Tambem falta registrar o resultado real dos segmentos
MongoDB de `find`, `replaceOne` e `bulkWrite` no DocumentDB do **OS Service**,
inclusive se negativo. Widgets/alertas ficam em #345/#346. Um futuro PR deve
usar `Refs #343`, sem fechamento automatico.

## Pendencias conhecidas

- OpenAPI exportado e versionado neste README (depende do deploy em HML).
- Divergencias do template do OS Service: o `jwt.config.ts` copiado foi reduzido a verificacao (sem assinatura) e o `jwt.config.spec.ts` foi reescrito para o contrato de verificacao.
