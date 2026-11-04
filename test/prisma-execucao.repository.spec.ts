import { PrismaService } from '../src/shared/infrastructure/database/prisma.service';
import { PrismaExecucaoRepository } from '../src/modules/execucao/infrastructure/repositories/prisma-execucao.repository';
import { Execucao, ExecucaoStatus } from '../src/modules/execucao/domain/entities/execucao.entity';

describe('PrismaExecucaoRepository conditional save', () => {
  it('uses current status as compare-and-swap condition', async () => {
    const row = { ...Execucao.criar('os-1').toProps(), status: ExecucaoStatus.AGUARDANDO_REPARO };
    const prisma = {
      execucao: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const repository = new PrismaExecucaoRepository(prisma as unknown as PrismaService);
    const entity = Execucao.restaurar(row);
    entity.cancelar();
    const saved = await repository.save(entity, ExecucaoStatus.AGUARDANDO_DIAGNOSTICO);
    expect(prisma.execucao.updateMany).toHaveBeenCalledWith({
      where: { id: row.id, status: ExecucaoStatus.AGUARDANDO_DIAGNOSTICO },
      data: { ...entity.toProps(), id: undefined },
    });
    expect(saved).toBe(false);
  });
});
