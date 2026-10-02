# repo-execucao-service

Servico de Execucao e Producao do Tech Challenge Fase 4 (FIAP 15SOAT). Feature #319 do repositorio `async-furious-project`.

Stack: NestJS 10, Prisma 5, PostgreSQL, Node 22, pnpm. Quatro camadas por modulo (`domain`, `application`, `infrastructure`, `presentation`) mais `shared/`.

## Origem

Scaffold **copiado** do OS Service, sem fork, sem pacote npm compartilhado e sem submodulo git. Nenhum model do monolito foi herdado. O unico model inicial e `ProcessedEvent` (idempotencia por `eventId`), porque o Prisma 5 nao gera o client com schema sem models.

## Banco de dados

PostgreSQL, banco `execucao_producao`, role `execucao_app` na instancia RDS unica, com `connection_limit=3` no `DATABASE_URL`. O secret `tc3-db-execucao-<env>` e provisionado pelo Epic #312 (`repo-db-infra`). O servico nao acessa tabelas de outro servico.

**Este servico nao hospeda NoSQL.** "O Execucao era quem ia levar o NoSQL" foi hipotese de trabalho durante o planejamento e nao vale mais: a saga e coreografada (nao existe orquestrador) e o DocumentDB ganhou uso de negocio como read model de OS e Cliente dentro do OS Service, o que ja cumpre o requisito de NoSQL do enunciado. A fila e o ciclo de execucao cabem em PostgreSQL. Se o assunto voltar, a regra de convivencia seria a mesma do relacional: tabela propria por servico, IAM policy restrita a ela, nunca acesso cruzado.

## Estrategia de Saga

**Coreografada.** Nao ha orquestrador: cada servico reage a eventos do Kafka e publica os seus. Este servico ainda nao tem consumidor implementado; apenas as variaveis de cliente (`KAFKA_BROKERS`, `KAFKA_SASL_USERNAME`, `KAFKA_SASL_PASSWORD`, `KAFKA_CONSUMER_GROUP`) estao no configmap/secret.

## Autenticacao

`src/auth/` e a variante stateless do JWT local (ADR-0021): `JwtStrategy` valida localmente e devolve `{ id: sub, email, role }`, sem Prisma e sem `AuthService`. Token sem `role` vira `Role.CLIENTE` e recebe 403 em rota com `@Roles`. Role fora do enum e rejeitada com 401. O `sub` fica em `request.user.id`, via `@CurrentUser('id')`, para uso como `responsavelId`. Rota de validacao: `GET /api/v1/execucao/me` com `@Roles(Role.MECANICO)`.

## Rodando localmente

```bash
cp .env.example .env
docker compose -f docker-compose.dependencies.yml up -d
pnpm install
pnpm exec prisma migrate deploy
pnpm start
```

- Healthcheck: `/api/v1/health`, `/api/v1/health/live`, `/api/v1/health/ready`
- Swagger: `/api/docs/execucao`

## Kubernetes

Manifests em `k8s/`: namespace `execucao`, Deployment, Service, migration Job, configmap e secret. Namespace, ECR proprio e banco/role sao provisionados pelo Epic #312. Workflows de CI/CD e protecao de branch ficam para a Feature de Testes e Pipeline.

## Pendencias conhecidas

- OpenAPI exportado e versionado neste README (depende do deploy em HML).
- Cobertura abaixo de 80%: os specs de health, filtro de excecoes, `PrismaService` e excecoes de dominio nao foram copiados do OS Service. O gate e da Feature de Testes e Pipeline.
- Divergencias do template do OS Service: o `jwt.config.ts` copiado foi reduzido a verificacao (sem assinatura) e o `jwt.config.spec.ts` nao veio junto.
