import { Execucao, ExecucaoStatus } from '../entities/execucao.entity';

export const EXECUCAO_REPOSITORY = Symbol('EXECUCAO_REPOSITORY');

export interface FiltroFilaExecucao {
  status: ExecucaoStatus[];
  responsavelId?: string;
}

export interface IExecucaoRepository {
  create(execucao: Execucao): Promise<boolean>;
  findById(id: string): Promise<Execucao | null>;
  findByOrdemServicoId(id: string): Promise<Execucao | null>;
  save(execucao: Execucao): Promise<void>;
  transition(
    id: string,
    from: ExecucaoStatus[],
    to: ExecucaoStatus,
    at: Date,
    fields?: {
      responsavelId?: string;
      diagnosticoIniciadoEm?: Date;
      reparoIniciadoEm?: Date;
      concluidaEm?: Date;
    }
  ): Promise<{ execucao: Execucao | null; changed: boolean }>;
  listar(filtro: FiltroFilaExecucao): Promise<Execucao[]>;
}
