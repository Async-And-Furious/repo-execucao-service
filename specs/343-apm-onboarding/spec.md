# Feature Specification: Execução — onboarding APM local (#343, entrega parcial)

**Feature Branch**: `feat/343-apm-onboarding`

**Created**: 2026-10-29

**Status**: Coordinator-approved for bounded Phase 3 implementation (2026-10-29); full #343 acceptance remains pending

**Input**: Issue [#343](https://github.com/Async-And-Furious/async-furious-project/issues/343), complete live body and comments (none), and explicit approval to use installed Spec Kit instead of unavailable Matt `/to-spec`. Only independent Execução onboarding; not closure of the multi-repository issue.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preparar a identidade de observabilidade (Priority: P1)

Como responsável pelo serviço, quero iniciar a aplicação com a instrumentação carregada antes dos demais componentes, sem substituir a plataforma herdada e sem precisar de credenciais para desenvolver e testar localmente.

**Why this priority**: é a menor entrega independente que prepara o segundo serviço para observabilidade, sem esperar Billing ou acesso ao ambiente remoto.

**Independent Test**: testes locais verificam ordem de carregamento, dependência de runtime, configuração declarada e carregamento do agente explicitamente desabilitado, sem banco, broker ou coletor remoto.

**Acceptance Scenarios**:

1. **Given** uma instalação reproduzível do serviço, **When** o entrypoint é inspecionado e compilado, **Then** a primeira importação executável é a do agente, antes do framework, logger e módulo da aplicação.
2. **Given** processo de teste com agente explicitamente desabilitado e sem license key, **When** o agente é carregado em subprocesso isolado, **Then** o processo termina com sucesso sem requerer coletor, banco ou Kafka.
3. **Given** a configuração declarativa de HML, **When** o contrato de configuração é verificado localmente, **Then** a identidade é `af-execucao-hml`, a configuração é exclusivamente por ambiente, logs do agente vão para stdout e não há segundo encaminhamento de logs pelo agente.

### User Story 2 - Operar sem confundir preparação com aceite remoto (Priority: P2)

Como operador, quero saber quais variáveis fornecer, onde consultar o dashboard e quais evidências ainda faltam, para não tratar agente importado como trace distribuído comprovado.

**Why this priority**: impede falso encerramento de #343 e evita repetir os incidentes de permissão de log e credencial inválida da Fase 3.

**Independent Test**: revisão do parágrafo de observabilidade do README contra os nomes e limites de #343 e ADR-0005.

**Acceptance Scenarios**:

1. **Given** o README atualizado, **When** um operador prepara o ambiente, **Then** encontra identidade HML, variáveis, configuração antes do início do processo e referência ao dashboard existente, sem credencial ou URL de entidade inventada.
2. **Given** apenas checks locais aprovados, **When** a entrega é descrita no futuro PR, **Then** consta explicitamente “entrega parcial de #343”, usa `Refs #343` (nunca `Closes`/`Fixes`/`Resolves #343`) e enumera os gates remotos pendentes.

### Edge Cases

- `.env` lido pelo módulo de configuração depois do primeiro import não configura retroativamente o agente: as variáveis do agente devem existir no ambiente do processo antes do entrypoint. Não adicionar bootstrap/helper de dotenv para contornar isso.
- Sem key, testes locais usam o modo desabilitado; isso não valida ingestão, credencial ou comportamento habilitado em HML. Não criar validação de key ou falha customizada de bootstrap neste slice.
- Container sem permissão de escrita em `/app`: `NEW_RELIC_LOG=stdout` evita arquivo de log, sem mudar usuário ou permissões da imagem.
- Decoração local habilitada não garante `trace.id` no log tardio de “request completed” do pino-http; preservar essa limitação conhecida.
- Variáveis já existentes de JWT/Kafka/banco e validação/erros da aplicação não podem mudar. Nenhuma coleta extra de bodies, headers sensíveis ou dados pessoais será habilitada.
- Tracing distribuído não pode ser desabilitado; o default habilitado do agente é preservado e explicitado como `true` no contrato declarativo. Sampling não muda.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O serviço MUST carregar o agente antes de qualquer módulo de aplicação e incluí-lo nas dependências de produção (cenário 1.1).
- **FR-002**: A configuração MUST vir somente do ambiente; MUST NOT introduzir arquivo de configuração do agente, SDK OTel, propagação manual ou código de instrumentação de domínio (cenários 1.1–1.3).
- **FR-003**: A identidade HML MUST ser `af-execucao-hml`. `async-furious-project-hml` e `af-billing-hml` são identidades de outros serviços, não aliases deste (cenário 1.3).
- **FR-004**: O contrato declarativo MUST manter tracing habilitado, decoração local de logs habilitada, forwarding pelo agente desabilitado e log do agente em stdout (cenário 1.3).
- **FR-005**: Testes e instruções locais MUST permitir checagem sem key e sem envio de telemetria, desabilitando explicitamente o agente no ambiente antes da execução (cenário 1.2).
- **FR-006**: README MUST documentar identidade, variáveis, dashboard existente, limitação Gateway/Lambda e gates pendentes de HML, sem afirmar observação atual de runtime (cenário 2.1).
- **FR-007**: Nenhum segredo, configuração de conta/repositório, workflow, recurso remoto, contrato HTTP/evento ou banco MUST mudar neste incremento (cenários 2.1–2.2).
- **FR-008**: A entrega MUST permanecer parcial: Billing, distribuição de key, Kafka/trace real e datastore DocumentDB continuam critérios abertos da issue (cenário 2.2).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos checks locais de ordem de carregamento, configuração e isolamento passam sem credenciais ou serviços externos.
- **SC-002**: Há exatamente uma identidade HML declarada para este serviço e zero renomeações das identidades dos outros serviços.
- **SC-003**: O operador encontra em uma seção do README todos os pré-requisitos de onboarding e os quatro grupos de aceite ainda pendentes: Billing, credencial/deploy, trace entre serviços e datastore do OS.
- **SC-004**: Zero arquivos de domínio, endpoints, schemas de banco/eventos, workflows ou valores secretos são alterados.

## Assumptions

- Fonte prioritária: enunciado atual em `docs/specs/tech-challenge-fase4.md` do workspace (reuso da observabilidade da Fase 3 e rastreamento do fluxo); ADR-0005 aceita e ADRs-0016–0021 aceitas no OS Service. ADR-0022 está **Proposta**, não autoriza mudanças.
- Base fresca: `origin/develop` = `4660678881ef8a329b969c06d1a4115a8d080d7a`, merge de Execução PR #2/#320. Canonical permaneceu em `main`, limpo e não editado. Nenhum PR aberto neste repositório no refresh de 2026-10-29.
- #343 está OPEN, assignee `vrbb`, sem comentários e sem `blocked_by` nativo; o responsável existente é preservado, este spec não transfere ownership.
- #312, #328, #337 e #344 continuam abertos. A aplicação ainda usa publisher de log e não tem cliente Kafka no develop; #337/eventos e #344 são dependências do aceite remoto, não do import/config/testes locais. #328 mantém ownership da esteira/deploy. Billing não tem `develop`; não criar essa branch nem usar `main` como substituta.
- #378 foi lida somente como contexto: item 14 também toca `src/main.ts`, mas `trust proxy`/throttling não entram aqui; item 15 continua candidato independente, item 16 pertence ao trabalho de eventos. Não corrigir esses itens neste slice. #351 (incluindo N/A Terraform) não pertence a este spec.
- A existência de dashboard e histórico em ADR-0005 é evidência documental histórica, não uma consulta atual a HML/New Relic.

## Constraints and validation seams requested by the coordinator

Esta seção registra limites técnicos já impostos pela issue e pelo solicitante, não cria `plan.md`, tasks ou autorização de implementação.

### Smallest complete code and documentation scope

| Arquivo | Mudança permitida em fase posterior |
| --- | --- |
| `package.json`, `pnpm-lock.yaml` | Adicionar somente dependência de produção `newrelic` **14.4.0**, versão já resolvida no OS Service; lock atualizado pelo pnpm fixado, sem upgrades incidentais. |
| `src/main.ts` | Adicionar `import 'newrelic';` como primeira linha; nenhuma outra mudança no bootstrap, erro, autenticação ou proxy. |
| `.env.example` | Documentar apenas variáveis não secretas/placeholder vazio da key e modo local explicitamente desabilitado; nunca valor real. Explicar que devem ser exportadas antes do processo. |
| `k8s/configmap.yaml` | Acrescentar apenas contrato não secreto do agente para HML, sem aplicar manifests. |
| `README.md` | Uma seção de observabilidade: identidade, variáveis, pré-carregamento, dashboard, status parcial e limites conhecidos. Não reescrever outras seções. |
| `test/observability/newrelic-onboarding.spec.ts` | Novo teste de contrato/isolamento, sem executar bootstrap da aplicação ou rede. Usar Jest/TypeScript/Node já presentes; nenhuma dependência de teste nova. |

Nenhum outro caller/export/fixture é necessário: o único entrypoint de aplicação é `src/main.ts`; `prod` e o Dockerfile executam `dist/main`. Não modificar `AppModule`, serviços, logger, consumidores, Dockerfile, Jest config ou thresholds. Não criar SDK/wrapper/newrelic.js. Não alterar `k8s/secret.yaml`, `k8s/deployment.yaml` ou workflows: o Deployment já usa `execucao-secret` via `envFrom`; a injeção futura da key é um handoff de deploy, não parte desta entrega. Registrar sessão na documentação de agente somente no worktree e sem misturar trabalho de outros donos, conforme orientação do coordenador.

### Environment and dependency/import order

- Ambiente requerido: **Node 22**, `.nvmrc=22`, Docker `node:22-slim`, `packageManager=pnpm@10.18.3`. Shell observado nesta sessão: Node `v26.12.0`, pnpm `12.14.0`; não são evidência de validação compatível e não justificam alterar engines/packageManager. Disponibilizar Node 22 + pnpm fixado antes da implementação/testes.
- Ordem obrigatória futura: adicionar dependência de runtime/lock com pnpm 10.18.3 → primeiro import em `main.ts` → compilação preserva primeiro carregamento do agente → só então Nest/Pino/AppModule. Ambiente fornecido antes do import; não depender de ConfigModule/dotenv tardio.
- `newrelic` 14.4.0 é o mínimo já comprovado pelo lock do OS Service; não copiar o range inferior `^14.3.8`. Nenhum `kafkajs`, OTel ou pacote de tipos entra neste slice.
- ConfigMap HML: `NEW_RELIC_NO_CONFIG_FILE='true'`, `NEW_RELIC_APP_NAME='af-execucao-hml'`, `NEW_RELIC_DISTRIBUTED_TRACING_ENABLED='true'`, `NEW_RELIC_APPLICATION_LOGGING_ENABLED='true'`, `NEW_RELIC_APPLICATION_LOGGING_LOCAL_DECORATING_ENABLED='true'`, `NEW_RELIC_APPLICATION_LOGGING_FORWARDING_ENABLED='false'`, `NEW_RELIC_LOG='stdout'`. Não adicionar labels opcionais (exigiriam convenção simultânea nos três serviços).
- Local: mesmos controles não secretos, `NEW_RELIC_ENABLED=false` e key vazia, identidade local distinta `af-execucao-local`, sem envio. HML habilitado pelo default do agente; exige key válida injetada externamente antes de iniciar. Não pôr key no ConfigMap ou em comandos/logs.
- Public seams: import no entrypoint CommonJS compilado; variáveis do processo; `envFrom` já existente; stdout; README. Nenhum novo endpoint, header, evento, atributo customizado ou mudança da distinção entre `trace.id`, correlação HTTP e `correlationId=ordemServicoId` do envelope.

### Required local tests (future implementation, not executed in Phase 2)

Executar dentro deste worktree, com Node 22 e pnpm 10.18.3, sem arquivos `.env` copiados do canonical nem key real. Em todos os comandos usar prefixo `NEW_RELIC_ENABLED=false NEW_RELIC_NO_CONFIG_FILE=true NEW_RELIC_LICENSE_KEY=`. Não executar `dev`, migrações, seed, deploy ou e2e contra ambientes compartilhados.

Errata de Phase 3: o teste com o agente instalado confirmou em `lib/config/default.js` que `agent_enabled` lê `NEW_RELIC_ENABLED`; corrigida a grafia anterior `NEW_RELIC_AGENT_ENABLED`, que não desabilitava o agente. Nenhum segredo foi fornecido; a tentativa anterior abortou a inicialização por falta de key. A correção preserva o requisito aprovado de execução local sem telemetria.

1. `pnpm install --frozen-lockfile` (após atualizar lock na implementação; inspeção de diff para barrar upgrades incidentais).
2. `pnpm exec jest --runInBand test/observability/newrelic-onboarding.spec.ts`: testar primeiro import via parser TypeScript instalado; dependência de produção 14.4.0; variáveis declarativas e exclusão de key do ConfigMap; stdout/decoração/forwarding; ausência de arquivo de configuração/OTel direto. Subprocesso Node carrega o agente real com ambiente desabilitado e key vazia, sem importar `main.ts`, confirma saída 0. Testes não simulam ingestão.
3. `pnpm exec eslint 'src/**/*.ts' 'test/**/*.ts'` (sem `--fix`); `pnpm type:check`; `pnpm test --runInBand`; `pnpm test:cov --runInBand`; `pnpm build`. Manter thresholds de 80% nos quatro indicadores. Falhas preexistentes devem ser relatadas, não corrigidas fora do escopo.
4. Depois do build, conferir que o **primeiro carregamento de módulo** em `dist/main.js` é `require('newrelic')` antes de Nest/Pino/AppModule (diretivas CommonJS como `use strict` e metadados do compilador não são imports). Não iniciar a aplicação para isso; registrar assert/inspeção no relatório do coordenador.
5. `git diff --check`; conferir links Markdown relativos novos e allowlist de arquivos. Garantir que os testes não capturam credenciais nem iniciam rede. Não afirmar que o subprocesso desabilitado prova instrumentação habilitada.

### HML acceptance — deliberately separate and NOT executed/authorized

- Donos autorizados de plataforma/deploy precisam disponibilizar `NEW_RELIC_LICENSE_KEY` como secret de organização; se não permitido pelo plano, aplicar a alternativa aprovada de duplicação **com verificação bloqueante de key antes de deploy**. Este spec não escolhe fallback nem inspeciona/muda settings/secrets.
- #328 precisa conectar o segredo ao ambiente do container e manter este contrato de ConfigMap, namespace e imagem imutável. Ausência atual da key e da esteira não impede aceite local, mas impede dizer “onboarding HML concluído”.
- Confirmar na UI os três nomes, preservando a entidade e histórico do OS Service. Assim que o segundo serviço estiver disponível, #344/#337 precisam demonstrar um único trace OS → Kafka → Execução por `OrdemServicoRecebida`, incluindo transação no consumidor, com print/link na issue. Nenhuma chamada REST entre serviços é introduzida.
- No OS Service, registrar resultado real (inclusive negativo) de `find`, `replaceOne`, `bulkWrite` no DocumentDB como segmentos MongoDB; métricas de infraestrutura são CloudWatch. Não instalar MongoDB/DocumentDB no Execução.
- Limitação: trace começa no primeiro serviço; Gateway → Lambda/Authorizer não é coberto. Dashboard de referência: New Relic One, `tc3-observability-hml`, mantido por `repo-k8s-infra`; extensão de widgets/alertas é #345/#346, não esta entrega.
- PR futuro deve explicitar o escopo parcial, testes locais executados e estes gates ainda pendentes. Não fechar #343, não declarar HML validado, não alterar PROD.

### Phase 2 workflow evidence

Instalado `spec-kit-wizard/SKILL.md` foi lido; foi seguido o fluxo Specify do comando configurado do OS Service `.opencode/command/speckit.specify.md` e seu `.specify/templates/spec-template.md`, com checklist separado em `checklists/requirements.md`. O wizard para na revisão humana/coordenador antes de Plan/Tasks/Implement.

Adaptação explícita às instruções do solicitante: o helper `create-new-feature.sh` gera numeração e faz checkout na raiz; **não foi executado**, pois violaria branch/worktree exatos e preservação do canonical. Branch/worktree criados por `git worktree add` após fetch, inspeção de refs locais/remotas e lista de worktrees; nenhum collision encontrado. Execução não possui Spec Kit local nem AGENTS/CLAUDE/CONTRIBUTING versionados; o template/comando instalado central foi aplicado sem copiar configuração, inicializar kit ou inventar constituição. Constituição instalada central é apenas template não preenchido; regras vigentes continuam enunciado/ADRs/AGENTS. Não há `extensions.yml` nem hooks configurados nas raízes inspecionadas. Nenhum script de feature, plano, tasks, produção, commit, push ou PR foi executado.

### Phase 3 local implementation record (2026-10-29)

Coordenador aprovou os limites deste spec. Carregadas as skills instaladas `matt-implement` e `matt-tdd`; quatro ciclos verticais red→green: agente de produção carregado desabilitado, primeiro import, configuração HML e exemplo local. Evidências externas em `/tmp/opencode/343-implementation-evidence/`; sem key real, `.env` copiado ou runtime de aplicação iniciado.

Uma tentativa isolada disponibilizou Node **22.23.4** e pnpm **10.18.3** em `/tmp/opencode/343-tooling`, sem configuração global. O typecheck inicial detectou client Prisma não gerado; recuperação local única via `pnpm exec prisma generate` (sem migração/conexão ao banco) resolveu. A errata da variável de disable está registrada acima. O agente desabilitado registra sua inatividade em stdout; o teste respeita esse log, não exige stdout vazio.

Validação final: frozen install, foco (4/4), ESLint sem fix, typecheck, unit (17 suítes/119 testes), cobertura (mesmos 119 testes) e build passaram; cada gate completo executado uma vez no final. Cobertura: statements **98.98%**, branches **88.23%**, functions **98.55%**, lines **98.89%**. Assert sobre AST do JS compilado confirma primeiro carregamento `require('newrelic')` em `dist/main.js:6`, antes de Nest/Pino/AppModule, sem executar `main`. Lock conserva integralmente as 784 entradas de packages e 785 snapshots anteriores; adiciona apenas 97 entradas transitivas de cada seção para o agente fixado. Seis metadados `libc` removidos incidentalmente pelo pnpm foram preservados; nenhum upgrade preexistente.

Revisão independente será despachada pelo coordenador; este registro não a substitui. Nenhum push, PR, alteração de issue/settings/secrets, deploy ou aceite remoto ocorreu. A entrega continua parcial de #343.
