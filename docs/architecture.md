# Arquitetura do Execução e Produção

## Responsabilidade e limites

O Execução e Produção gerencia a fila e o ciclo operacional da execução de uma Ordem de Serviço: cria uma execução quando recebe `OrdemServicoRecebida`, acompanha diagnóstico e reparo iniciados pelo mecânico, e informa o início e a conclusão do reparo ao OS Service por eventos. O estado pertence a este serviço. A identidade da OS é mantida como `ordemServicoId`; não há leitura ou escrita no banco de outro serviço nem chamadas REST entre microsserviços.

Uma execução começa em `AGUARDANDO_DIAGNOSTICO`. O mecânico inicia o diagnóstico (`EM_DIAGNOSTICO`); depois da confirmação do pagamento, a execução entra em `AGUARDANDO_REPARO`; o mecânico inicia o reparo (`EM_REPARO`) e o conclui (`CONCLUIDA`). Recusa de orçamento/pagamento ou uma falha de Saga cancelável pode levar a `CANCELADA`. As transições são condicionais ao estado atual. Uma `ordemServicoId` única torna idempotente a criação de uma execução para a mesma OS.

## REST e OpenAPI

O prefixo global é `/api/v1`; o Swagger UI é servido em `/api/docs/execucao`. As rotas abaixo refletem `ExecucaoController`, DTOs e o prefixo configurado em `main.ts`:

| Método | Rota | Comportamento |
|---|---|---|
| `GET` | `/api/v1/execucoes` | Lista a fila, ordenada por criação. `status` é opcional e deve ser um status válido; sem ele, lista `AGUARDANDO_DIAGNOSTICO` e `AGUARDANDO_REPARO`. `responsavelId` é opcional. |
| `PATCH` | `/api/v1/execucoes/{id}/iniciar-diagnostico` | Exige UUID; muda `AGUARDANDO_DIAGNOSTICO` para `EM_DIAGNOSTICO`, registra o `sub` autenticado como `responsavelId` e publica `DiagnosticoIniciado`. |
| `PATCH` | `/api/v1/execucoes/{id}/iniciar-reparo` | Exige UUID; muda `AGUARDANDO_REPARO` para `EM_REPARO` e publica `ExecucaoIniciada`. |
| `PATCH` | `/api/v1/execucoes/{id}/concluir` | Exige UUID; muda `EM_REPARO` para `CONCLUIDA` e publica `ExecucaoConcluida`. |

Todas as rotas exigem Bearer JWT válido e papel `MECANICO`. A resposta de execução inclui `id`, `ordemServicoId`, `status`, responsável, datas de diagnóstico/reparo/conclusão e datas de criação/atualização. Não existe rota REST de criação: a execução é criada pelo consumidor de eventos.

## Saga e contratos Kafka

O serviço é um participante da Saga coreografada. `correlationId` e chave Kafka são o `ordemServicoId`. O contrato comum usa `eventId`, `eventType`, `eventVersion`, `occurredAt`, `producer`, `correlationId` e `data`.

**Consome** com o grupo `execucao-consumer`:

| Tópico | Eventos tratados |
|---|---|
| `os.eventos.v1` | `OrdemServicoRecebida`; `EtapaDaSagaFalhou` quando publicada pelo OS Service. |
| `billing.eventos.v1` | `PagamentoConfirmado`, `OrcamentoRecusado`, `PagamentoRecusado` e `EtapaDaSagaFalhou` quando publicada pelo Billing Service. |
| `execucao.retry.v1` | Reentregas locais de eventos com falha técnica. |

`OrdemServicoRecebida` cria uma única execução; duplicatas são reconhecidas pela unicidade de `ordemServicoId` e ignoradas. `PagamentoConfirmado` move somente `EM_DIAGNOSTICO` para `AGUARDANDO_REPARO`; ausência de execução ou recebimento prematuro é retryable. Recusas e falhas de Saga cancelam somente estados canceláveis; `EtapaDaSagaFalhou` com `etapa=reparo` é ignorada. Eventos repetidos ou incompatíveis com o estado atual são ignorados.

**Publica** em `execucao.eventos.v1`:

| Evento | Quando |
|---|---|
| `DiagnosticoIniciado` | O mecânico inicia o diagnóstico. |
| `ExecucaoIniciada` | O mecânico inicia o reparo. |
| `ExecucaoConcluida` | O mecânico conclui o reparo. |

Os três eventos são publicados depois da transição local no PostgreSQL. O produtor usa KafkaJS idempotente e `acks=-1`. Falhas técnicas têm até três tentativas totais, com backoff e `notBefore`, via `execucao.retry.v1`; falhas de negócio, envelopes inválidos e tentativas esgotadas são encaminhados a `execucao.dlt.v1`. O consumidor pausa apenas a partição em espera de backoff.

**Limitação conhecida:** não há outbox (ADR-0018). Se a publicação falhar depois do `UPDATE`, o estado local permanece gravado e o evento se perde; reprocessar Kafka não recupera uma mensagem que nunca chegou ao broker, e o detector de OS parada do OS Service cobre apenas `aprovacao-pagamento`. A reconciliação entre OS e Execução é manual.

O processamento de DLT e sua conversão em `EtapaDaSagaFalhou` pertencem ao Saga Epic e **não são implementados aqui**. O serviço não consome `execucao.dlt.v1` nem declara essa compensação como concluída.

## Persistência e ownership

O serviço é dono do seu banco PostgreSQL (`execucao_producao`) e da credencial de aplicação (`execucao_app`). O modelo `Execucao` guarda o estado da fila e tem `ordemServicoId` único.

| Coluna (`execucoes`) | Tipo | Observação |
|---|---|---|
| `id` | texto, PK | Identificador da execução. |
| `ordem_servico_id` | texto, único | Referência lógica à OS, sem FK. |
| `status` | enum `ExecucaoStatus` | `AGUARDANDO_DIAGNOSTICO` (padrão), `EM_DIAGNOSTICO`, `AGUARDANDO_REPARO`, `EM_REPARO`, `CONCLUIDA`, `CANCELADA`. |
| `responsavel_id` | texto, opcional | `sub` do mecânico que iniciou o diagnóstico. |
| `diagnostico_iniciado_em`, `reparo_iniciado_em`, `concluida_em` | timestamp, opcionais | Instantes das transições. |
| `created_at`, `updated_at` | timestamp | Auditoria. |

O índice `(status, created_at)` sustenta a fila de diagnóstico e de reparo. Não existe FK para a OS, cópia de dados de outro serviço ou acesso cruzado a tabelas. O PostgreSQL/RDS é uma dependência do serviço; detalhes de provisionamento e credenciais pertencem à infraestrutura compartilhada.

O modelo/tabela legado `ProcessedEvent`/`processed_events` ainda aparece no schema e na migration inicial, mas o fluxo desta Saga não o consulta nem o usa para deduplicação. A deduplicação é feita pela unicidade da OS e pelas guardas de estado.

## Dependências de entrada e configuração

- **REST:** no desenho-alvo central, o API Gateway HTTP API encaminha tráfego autenticado pelo VPC Link ao ALB interno, que roteia `/api/v1/execucoes*` para este serviço. O serviço valida JWT localmente e aplica autorização por papel. Não há chamadas REST de saída para OS Service ou Billing Service.
- **Kafka:** broker acessado por `KAFKA_BROKERS`; grupo opcional `KAFKA_CONSUMER_GROUP` (fallback `execucao-consumer`). SASL/PLAIN é habilitado quando `KAFKA_SASL_USERNAME` e `KAFKA_SASL_PASSWORD` estão ambos configurados; configurar apenas um é erro.
- **JWT:** em ambiente local, `JWT_SECRET` verifica tokens HS256. A configuração de produção exige RS256 e chave pública (`JWT_PUBLIC_KEY`), além dos claims/configuração de issuer e audience. Não reutilize credenciais locais em ambientes compartilhados.
- **PostgreSQL:** `DATABASE_URL` aponta para o banco próprio do serviço.

## Execução local

Requer Node.js `>=22` e pnpm `10.18.3`. O Compose do repositório inicia somente PostgreSQL; um broker Kafka local ou acessível deve ser iniciado separadamente, pois o consumidor conecta ao broker durante o bootstrap da aplicação.

```bash
pnpm install
docker compose -f docker-compose.dependencies.yml up -d
export DATABASE_URL='postgresql://postgres:postgres@localhost:5434/execucao_producao?schema=public'
export JWT_SECRET='somente-para-desenvolvimento-local'
export KAFKA_BROKERS='localhost:9092'
pnpm exec prisma migrate deploy
pnpm start
```

Se o broker exigir SASL/PLAIN, configure também as duas variáveis `KAFKA_SASL_USERNAME` e `KAFKA_SASL_PASSWORD`. Para acessar uma rota protegida, forneça um JWT local válido com papel `MECANICO`. A aplicação escuta em `PORT` ou, por padrão, `3000`; Swagger UI: `/api/docs/execucao`; health checks: `/api/v1/health`, `/api/v1/health/live` e `/api/v1/health/ready`.

## Estado de validação

Esta documentação descreve contratos e código do repositório. O funcionamento, roteamento, tópicos, permissões e conectividade **em HML não foram verificados**; não se deve inferir implantação ou disponibilidade a partir deste documento.

Referências centrais: [ADR-0016: Saga coreografada](https://github.com/Async-And-Furious/async-furious-project/blob/develop/docs/adr/0016-saga-coreografada.md), [fluxo da Saga](https://github.com/Async-And-Furious/async-furious-project/blob/develop/docs/architecture/saga-flow.md), [catálogo de eventos](https://github.com/Async-And-Furious/async-furious-project/blob/develop/docs/architecture/event-catalog.md) e [topologia de borda](https://github.com/Async-And-Furious/async-furious-project/blob/develop/docs/architecture/edge-topology.md).

## ADRs transversais

[ADR-0016: Saga coreografada](https://github.com/Async-And-Furious/async-furious-project/blob/develop/docs/adr/0016-saga-coreografada.md) · [ADR-0017: Divisão dos microsserviços e ownership de dados](https://github.com/Async-And-Furious/async-furious-project/blob/develop/docs/adr/0017-divisao-microsservicos-ownership-dados.md) · [ADR-0018: Mensageria e contratos de eventos](https://github.com/Async-And-Furious/async-furious-project/blob/develop/docs/adr/0018-mensageria-contratos-eventos.md) · [ADR-0019: DocumentDB como read model de OS e cliente](https://github.com/Async-And-Furious/async-furious-project/blob/develop/docs/adr/0019-documentdb-read-model-os-cliente.md) · [ADR-0020: Bancos compartilhados e isolamento por credencial](https://github.com/Async-And-Furious/async-furious-project/blob/develop/docs/adr/0020-bancos-compartilhados-isolamento-credencial.md) · [ADR-0021: Borda sem BFF](https://github.com/Async-And-Furious/async-furious-project/blob/develop/docs/adr/0021-borda-sem-bff.md).
