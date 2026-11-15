import { Execucao, ExecucaoStatus } from '../../domain/entities/execucao.entity';
import { IExecucaoRepository } from '../../domain/ports/execucao.repository';

export type EventOutcome = 'processed' | 'ignore' | 'retryable' | 'business-error';
export interface SagaEnvelope {
  eventId: string;
  eventType: string;
  eventVersion: number;
  occurredAt: string;
  correlationId: string;
  data: Record<string, unknown>;
}

const CANCELLABLE = [
  ExecucaoStatus.AGUARDANDO_DIAGNOSTICO,
  ExecucaoStatus.EM_DIAGNOSTICO,
  ExecucaoStatus.AGUARDANDO_REPARO,
];

export class SagaEventHandler {
  constructor(private readonly repo: IExecucaoRepository) {}

  async handle(event: SagaEnvelope): Promise<EventOutcome> {
    const orderId = event.data.ordemServicoId;
    if (typeof orderId !== 'string' || !orderId) return 'business-error';

    if (event.eventType === 'OrdemServicoRecebida') {
      const execucao = Execucao.criar(orderId);
      return (await this.repo.create(execucao)) ? 'processed' : 'ignore';
    }

    const current = await this.repo.findByOrdemServicoId(orderId);
    if (!current) return event.eventType === 'PagamentoConfirmado' ? 'retryable' : 'ignore';
    const status = current.toProps().status;
    if (event.eventType === 'PagamentoConfirmado') {
      if (status === ExecucaoStatus.AGUARDANDO_DIAGNOSTICO) return 'retryable';
      if (status !== ExecucaoStatus.EM_DIAGNOSTICO) return 'ignore';
      current.liberarParaReparo(new Date());
      if (await this.repo.save(current, status)) return 'processed';
      const latest = await this.repo.findByOrdemServicoId(orderId);
      if (!latest) return 'retryable';
      return new Set<ExecucaoStatus>([
        ExecucaoStatus.AGUARDANDO_DIAGNOSTICO,
        ExecucaoStatus.EM_DIAGNOSTICO,
      ]).has(latest.toProps().status)
        ? 'retryable'
        : 'ignore';
    }

    if (!['OrcamentoRecusado', 'PagamentoRecusado', 'EtapaDaSagaFalhou'].includes(event.eventType))
      return 'ignore';
    if (event.eventType === 'EtapaDaSagaFalhou') {
      if (
        !['diagnostico', 'orcamento', 'aprovacao-pagamento', 'inicio-execucao', 'reparo'].includes(
          String(event.data.etapa)
        )
      )
        return 'business-error';
      if (event.data.etapa === 'reparo') return 'ignore';
    }
    if (!(CANCELLABLE as ExecucaoStatus[]).includes(status)) return 'ignore';
    current.cancelar(new Date());
    if (await this.repo.save(current, status)) return 'processed';
    const latest = await this.repo.findByOrdemServicoId(orderId);
    if (!latest) return 'ignore';
    return (CANCELLABLE as ExecucaoStatus[]).includes(latest.toProps().status)
      ? 'retryable'
      : 'ignore';
  }
}
