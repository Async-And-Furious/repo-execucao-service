import { EntityNotFoundException } from '../../../../shared/domain/exceptions/entity-not-found.exception';
import { DomainException } from '../../../../shared/domain/exceptions/domain.exception';
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
    if (!(await this.repo.save(execucao, ExecucaoStatus.AGUARDANDO_DIAGNOSTICO)))
      throw new DomainException('Execução mudou durante o início do diagnóstico; tente novamente');
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
    if (!(await this.repo.save(execucao, ExecucaoStatus.AGUARDANDO_REPARO)))
      throw new DomainException('Execução mudou durante o início do reparo; tente novamente');
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
    if (!(await this.repo.save(execucao, ExecucaoStatus.EM_REPARO)))
      throw new DomainException('Execução mudou durante a conclusão; tente novamente');
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
