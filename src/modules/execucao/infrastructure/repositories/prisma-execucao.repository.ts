import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/database/prisma.service';
import { Execucao, ExecucaoStatus } from '../../domain/entities/execucao.entity';
import { FiltroFilaExecucao, IExecucaoRepository } from '../../domain/ports/execucao.repository';

@Injectable()
export class PrismaExecucaoRepository implements IExecucaoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(execucao: Execucao): Promise<boolean> {
    try {
      await this.prisma.execucao.create({ data: execucao.toProps() });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        (typeof error.meta?.target === 'string'
          ? error.meta.target.includes('ordem_servico_id')
          : Array.isArray(error.meta?.target) &&
            (error.meta.target.includes('ordem_servico_id') ||
              error.meta.target.includes('ordemServicoId')))
      ) {
        return false;
      }
      throw error;
    }
  }

  async findById(id: string): Promise<Execucao | null> {
    const row = await this.prisma.execucao.findUnique({ where: { id } });
    return row ? Execucao.restaurar(row) : null;
  }

  async findByOrdemServicoId(id: string): Promise<Execucao | null> {
    const row = await this.prisma.execucao.findUnique({ where: { ordemServicoId: id } });
    return row ? Execucao.restaurar(row) : null;
  }

  async save(execucao: Execucao): Promise<void> {
    const { id, ...data } = execucao.toProps();
    await this.prisma.execucao.update({ where: { id }, data });
  }

  async transition(
    id: string,
    from: ExecucaoStatus[],
    to: ExecucaoStatus,
    at: Date,
    fields: {
      responsavelId?: string;
      diagnosticoIniciadoEm?: Date;
      reparoIniciadoEm?: Date;
      concluidaEm?: Date;
    } = {}
  ): Promise<{ execucao: Execucao | null; changed: boolean }> {
    const result = await this.prisma.execucao.updateMany({
      where: { id, status: { in: from } },
      data: { status: to, updatedAt: at, ...fields },
    });
    return result.count === 1
      ? { execucao: null, changed: true }
      : { execucao: await this.findById(id), changed: false };
  }

  async listar({ status, responsavelId }: FiltroFilaExecucao): Promise<Execucao[]> {
    const rows = await this.prisma.execucao.findMany({
      where: { status: { in: status }, ...(responsavelId ? { responsavelId } : {}) },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => Execucao.restaurar(row));
  }
}
