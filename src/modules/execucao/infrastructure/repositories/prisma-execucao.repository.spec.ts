import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/database/prisma.service';
import { Execucao } from '../../domain/entities/execucao.entity';
import { PrismaExecucaoRepository } from './prisma-execucao.repository';

const T0 = new Date('2026-10-27T10:00:00.000Z');

describe('PrismaExecucaoRepository', () => {
  const prisma = {
    execucao: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const repository = new PrismaExecucaoRepository(prisma as unknown as PrismaService);
  const execucao = Execucao.criar('os-1', T0);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.execucao.create.mockResolvedValue(undefined);
  });

  it('create grava todas as props do agregado', async () => {
    await expect(repository.create(execucao)).resolves.toBe(true);
    expect(prisma.execucao.create).toHaveBeenCalledWith({ data: execucao.toProps() });
  });

  it('create treats only the orderId unique constraint as a duplicate', async () => {
    prisma.execucao.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: '5.22.0',
        meta: { target: ['ordemServicoId'] },
      })
    );
    await expect(repository.create(execucao)).resolves.toBe(false);
    prisma.execucao.create.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(repository.create(execucao)).rejects.toThrow('database unavailable');
  });

  it('findById devolve null quando nao encontra', async () => {
    prisma.execucao.findUnique.mockResolvedValue(null);
    await expect(repository.findById('x')).resolves.toBeNull();
    expect(prisma.execucao.findUnique).toHaveBeenCalledWith({ where: { id: 'x' } });
  });

  it('findById restaura o agregado a partir da linha', async () => {
    prisma.execucao.findUnique.mockResolvedValue(execucao.toProps());
    const encontrada = await repository.findById(execucao.toProps().id);
    expect(encontrada?.toProps()).toEqual(execucao.toProps());
  });

  it('save atualiza pelo id sem regravar o id', async () => {
    const { id, ...data } = execucao.toProps();
    await repository.save(execucao);
    expect(prisma.execucao.update).toHaveBeenCalledWith({ where: { id }, data });
  });

  it('listar filtra por status e responsavel, ordenando por createdAt', async () => {
    prisma.execucao.findMany.mockResolvedValue([execucao.toProps()]);
    const lista = await repository.listar({ status: ['EM_REPARO'], responsavelId: 'mec-1' });
    expect(prisma.execucao.findMany).toHaveBeenCalledWith({
      where: { status: { in: ['EM_REPARO'] }, responsavelId: 'mec-1' },
      orderBy: { createdAt: 'asc' },
    });
    expect(lista.map((e) => e.toProps())).toEqual([execucao.toProps()]);
  });

  it('listar sem responsavel nao filtra por responsavel', async () => {
    prisma.execucao.findMany.mockResolvedValue([]);
    await repository.listar({ status: ['AGUARDANDO_DIAGNOSTICO', 'AGUARDANDO_REPARO'] });
    expect(prisma.execucao.findMany).toHaveBeenCalledWith({
      where: { status: { in: ['AGUARDANDO_DIAGNOSTICO', 'AGUARDANDO_REPARO'] } },
      orderBy: { createdAt: 'asc' },
    });
  });
});
