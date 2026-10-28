import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/database/prisma.service';
import { Execucao } from '../../domain/entities/execucao.entity';
import { FiltroFilaExecucao, IExecucaoRepository } from '../../domain/ports/execucao.repository';

@Injectable()
export class PrismaExecucaoRepository implements IExecucaoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(execucao: Execucao): Promise<void> {
    await this.prisma.execucao.create({ data: execucao.toProps() });
  }

  async findById(id: string): Promise<Execucao | null> {
    const row = await this.prisma.execucao.findUnique({ where: { id } });
    return row ? Execucao.restaurar(row) : null;
  }

  async save(execucao: Execucao): Promise<void> {
    const { id, ...data } = execucao.toProps();
    await this.prisma.execucao.update({ where: { id }, data });
  }

  async listar({ status, responsavelId }: FiltroFilaExecucao): Promise<Execucao[]> {
    const rows = await this.prisma.execucao.findMany({
      where: { status: { in: status }, ...(responsavelId ? { responsavelId } : {}) },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => Execucao.restaurar(row));
  }
}
