// Marcos publicados em execucao.eventos.v1. O envelope (eventId, eventVersion, occurredAt) e da ADR-0018
// e e montado pelo adapter Kafka na Feature de Eventos; correlationId e sempre o ordemServicoId.
export interface MarcoExecucaoData {
  execucaoId: string;
  ordemServicoId: string;
  responsavelId: string | null;
}

export class DiagnosticoIniciado {
  readonly eventType = 'DiagnosticoIniciado';
  constructor(readonly data: MarcoExecucaoData & { diagnosticoIniciadoEm: string }) {}
  get correlationId(): string {
    return this.data.ordemServicoId;
  }
}

export class ExecucaoIniciada {
  readonly eventType = 'ExecucaoIniciada';
  constructor(readonly data: MarcoExecucaoData & { reparoIniciadoEm: string }) {}
  get correlationId(): string {
    return this.data.ordemServicoId;
  }
}

export class ExecucaoConcluida {
  readonly eventType = 'ExecucaoConcluida';
  constructor(readonly data: MarcoExecucaoData & { concluidaEm: string }) {}
  get correlationId(): string {
    return this.data.ordemServicoId;
  }
}

export type EventoExecucao = DiagnosticoIniciado | ExecucaoIniciada | ExecucaoConcluida;
