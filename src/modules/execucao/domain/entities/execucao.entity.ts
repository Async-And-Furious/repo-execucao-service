import { randomUUID } from 'node:crypto';
import { DomainException } from '../../../../shared/domain/exceptions/domain.exception';

// Objeto + tipo uniao (nao enum TS) para casar com o tipo que o Prisma gera.
export const ExecucaoStatus = {
  AGUARDANDO_DIAGNOSTICO: 'AGUARDANDO_DIAGNOSTICO',
  EM_DIAGNOSTICO: 'EM_DIAGNOSTICO',
  AGUARDANDO_REPARO: 'AGUARDANDO_REPARO',
  EM_REPARO: 'EM_REPARO',
  CONCLUIDA: 'CONCLUIDA',
  CANCELADA: 'CANCELADA',
} as const;

export type ExecucaoStatus = (typeof ExecucaoStatus)[keyof typeof ExecucaoStatus];

export interface ExecucaoProps {
  id: string;
  ordemServicoId: string;
  status: ExecucaoStatus;
  responsavelId: string | null;
  diagnosticoIniciadoEm: Date | null;
  reparoIniciadoEm: Date | null;
  concluidaEm: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Os metodos de transicao sao a unica porta de mudanca de estado (base da idempotencia por guarda de estado).
export class Execucao {
  private constructor(private readonly props: ExecucaoProps) {}

  static criar(ordemServicoId: string, agora: Date = new Date()): Execucao {
    return new Execucao({
      id: randomUUID(),
      ordemServicoId,
      status: ExecucaoStatus.AGUARDANDO_DIAGNOSTICO,
      responsavelId: null,
      diagnosticoIniciadoEm: null,
      reparoIniciadoEm: null,
      concluidaEm: null,
      createdAt: agora,
      updatedAt: agora,
    });
  }

  static restaurar(props: ExecucaoProps): Execucao {
    return new Execucao({ ...props });
  }

  toProps(): ExecucaoProps {
    return { ...this.props };
  }

  iniciarDiagnostico(responsavelId: string, agora: Date = new Date()): void {
    this.transicionar(
      [ExecucaoStatus.AGUARDANDO_DIAGNOSTICO],
      ExecucaoStatus.EM_DIAGNOSTICO,
      'iniciar o diagnóstico',
      agora
    );
    this.props.responsavelId = responsavelId;
    this.props.diagnosticoIniciadoEm = agora;
  }

  liberarParaReparo(agora: Date = new Date()): void {
    this.transicionar(
      [ExecucaoStatus.EM_DIAGNOSTICO],
      ExecucaoStatus.AGUARDANDO_REPARO,
      'liberar para reparo',
      agora
    );
  }

  iniciarReparo(agora: Date = new Date()): void {
    this.transicionar(
      [ExecucaoStatus.AGUARDANDO_REPARO],
      ExecucaoStatus.EM_REPARO,
      'iniciar o reparo',
      agora
    );
    this.props.reparoIniciadoEm = agora;
  }

  concluir(agora: Date = new Date()): void {
    this.transicionar([ExecucaoStatus.EM_REPARO], ExecucaoStatus.CONCLUIDA, 'concluir', agora);
    this.props.concluidaEm = agora;
  }

  cancelar(agora: Date = new Date()): void {
    this.transicionar(
      [
        ExecucaoStatus.AGUARDANDO_DIAGNOSTICO,
        ExecucaoStatus.EM_DIAGNOSTICO,
        ExecucaoStatus.AGUARDANDO_REPARO,
      ],
      ExecucaoStatus.CANCELADA,
      'cancelar',
      agora
    );
  }

  private transicionar(
    origens: readonly ExecucaoStatus[],
    destino: ExecucaoStatus,
    acao: string,
    agora: Date
  ): void {
    if (!origens.includes(this.props.status)) {
      throw new DomainException(
        `Execução deve estar em ${origens.join(' ou ')} para ${acao}. Status atual: ${this.props.status}`
      );
    }
    this.props.status = destino;
    this.props.updatedAt = agora;
  }
}
