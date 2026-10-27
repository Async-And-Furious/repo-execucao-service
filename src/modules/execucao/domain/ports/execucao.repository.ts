import { Execucao, ExecucaoStatus } from '../entities/execucao.entity';

export const EXECUCAO_REPOSITORY = Symbol('EXECUCAO_REPOSITORY');

export interface FiltroFilaExecucao {
  status: ExecucaoStatus[];
  responsavelId?: string;
}

export interface IExecucaoRepository {
  create(execucao: Execucao): Promise<void>;
  findById(id: string): Promise<Execucao | null>;
  save(execucao: Execucao): Promise<void>;
  listar(filtro: FiltroFilaExecucao): Promise<Execucao[]>;
}
