import { EntityNotFoundException } from '../../../../shared/domain/exceptions/entity-not-found.exception';
import { Execucao, ExecucaoStatus } from '../../domain/entities/execucao.entity';
import {
  DiagnosticoIniciado,
  ExecucaoConcluida,
  ExecucaoIniciada,
  MarcoExecucaoData,
} from '../../domain/events/execucao.events';
import { IExecucaoEventPublisher } from '../../domain/ports/execucao-event-publisher';
import { IExecucaoRepository } from '../../domain/ports/execucao.repository';

// Sem status, a fila e o que espera mecanico: diagnostico e reparo.
const FILA_PADRAO: ExecucaoStatus[] = [
  ExecucaoStatus.AGUARDANDO_DIAGNOSTICO,
  ExecucaoStatus.AGUARDANDO_REPARO,
];

async function buscarExecucao(repo: IExecucaoRepository, id: string): Promise<Execucao> {
  const execucao = await repo.findById(id);
  if (!execucao) throw new EntityNotFoundException('Execucao', id);
  return execucao;
}

function marco(execucao: Execucao): MarcoExecucaoData {
  const { id, ordemServicoId, responsavelId } = execucao.toProps();
  return { execucaoId: id, ordemServicoId, responsavelId };
}

// ponytail: save e publish fora de transacao; se o publish falhar o estado ja foi gravado.
// Outbox entra na Feature de Eventos, junto com o adapter Kafka.

// Porta de AssumirOrdemServicoUseCase + AnalisarVeiculoUseCase do monolito.
export class IniciarDiagnosticoUseCase {
  constructor(
    private readonly repo: IExecucaoRepository,
    private readonly publisher: IExecucaoEventPublisher
  ) {}

  async execute(id: string, responsavelId: string): Promise<Execucao> {
    const execucao = await buscarExecucao(this.repo, id);
    const agora = new Date();
    execucao.iniciarDiagnostico(responsavelId, agora);
    await this.repo.save(execucao);
    await this.publisher.publish(
      new DiagnosticoIniciado({ ...marco(execucao), diagnosticoIniciadoEm: agora.toISOString() })
    );
    return execucao;
  }
}

// Rota nova: o reparo so comeca por acao do mecanico depois de PagamentoConfirmado.
export class IniciarReparoUseCase {
  constructor(
    private readonly repo: IExecucaoRepository,
    private readonly publisher: IExecucaoEventPublisher
  ) {}

  async execute(id: string): Promise<Execucao> {
    const execucao = await buscarExecucao(this.repo, id);
    const agora = new Date();
    execucao.iniciarReparo(agora);
    await this.repo.save(execucao);
    await this.publisher.publish(
      new ExecucaoIniciada({ ...marco(execucao), reparoIniciadoEm: agora.toISOString() })
    );
    return execucao;
  }
}

// Porta de FinalizarExecucaoUseCase do monolito.
export class ConcluirExecucaoUseCase {
  constructor(
    private readonly repo: IExecucaoRepository,
    private readonly publisher: IExecucaoEventPublisher
  ) {}

  async execute(id: string): Promise<Execucao> {
    const execucao = await buscarExecucao(this.repo, id);
    const agora = new Date();
    execucao.concluir(agora);
    await this.repo.save(execucao);
    await this.publisher.publish(
      new ExecucaoConcluida({ ...marco(execucao), concluidaEm: agora.toISOString() })
    );
    return execucao;
  }
}

export interface FiltroListarFila {
  status?: ExecucaoStatus;
  responsavelId?: string;
}

export class ListarFilaExecucaoUseCase {
  constructor(private readonly repo: IExecucaoRepository) {}

  execute({ status, responsavelId }: FiltroListarFila): Promise<Execucao[]> {
    return this.repo.listar({ status: status ? [status] : FILA_PADRAO, responsavelId });
  }
}
