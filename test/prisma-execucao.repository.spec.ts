import { PrismaService } from '../src/shared/infrastructure/database/prisma.service';
import { PrismaExecucaoRepository } from '../src/modules/execucao/infrastructure/repositories/prisma-execucao.repository';
import { Execucao, ExecucaoStatus } from '../src/modules/execucao/domain/entities/execucao.entity';

describe('PrismaExecucaoRepository atomic transitions', () => {
  it('uses conditional updateMany and returns whether this caller won the state transition', async () => {
    const row = { ...Execucao.criar('os-1').toProps(), status: ExecucaoStatus.AGUARDANDO_REPARO };
    const prisma = {
      execucao: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue(row),
      },
    };
    const repository = new PrismaExecucaoRepository(prisma as unknown as PrismaService);
    const transition = await repository.transition(
      row.id,
      [ExecucaoStatus.AGUARDANDO_DIAGNOSTICO],
      ExecucaoStatus.CANCELADA,
      new Date()
    );
    expect(prisma.execucao.updateMany).toHaveBeenCalledWith({
      where: { id: row.id, status: { in: [ExecucaoStatus.AGUARDANDO_DIAGNOSTICO] } },
      data: { status: ExecucaoStatus.CANCELADA, updatedAt: expect.any(Date) },
    });
    expect(transition).toEqual({ execucao: expect.any(Execucao), changed: false });
    expect(transition.execucao?.toProps().status).toBe(ExecucaoStatus.AGUARDANDO_REPARO);
  });
});
