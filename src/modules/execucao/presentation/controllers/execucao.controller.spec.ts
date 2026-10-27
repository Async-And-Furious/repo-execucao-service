import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../../../auth/enums/role.enum';
import { RolesGuard } from '../../../../auth/guards/roles.guard';
import {
  ConcluirExecucaoUseCase,
  IniciarDiagnosticoUseCase,
  IniciarReparoUseCase,
  ListarFilaExecucaoUseCase,
} from '../../application/use-cases/execucao.use-cases';
import { Execucao } from '../../domain/entities/execucao.entity';
import { ExecucaoController } from './execucao.controller';

describe('ExecucaoController', () => {
  const execucao = Execucao.criar('os-1', new Date('2026-10-27T10:00:00.000Z'));
  const listar = { execute: jest.fn() };
  const iniciarDiagnostico = { execute: jest.fn() };
  const iniciarReparo = { execute: jest.fn() };
  const concluir = { execute: jest.fn() };
  const controller = new ExecucaoController(
    listar as unknown as ListarFilaExecucaoUseCase,
    iniciarDiagnostico as unknown as IniciarDiagnosticoUseCase,
    iniciarReparo as unknown as IniciarReparoUseCase,
    concluir as unknown as ConcluirExecucaoUseCase
  );

  beforeEach(() => jest.clearAllMocks());

  it('listar repassa os filtros e devolve o DTO', async () => {
    listar.execute.mockResolvedValue([execucao]);
    const resposta = await controller.listar({ status: 'EM_REPARO', responsavelId: 'mec-1' });
    expect(listar.execute).toHaveBeenCalledWith({ status: 'EM_REPARO', responsavelId: 'mec-1' });
    expect(resposta).toEqual([execucao.toProps()]);
  });

  it('iniciarDiagnostico usa o responsavelId vindo do token', async () => {
    iniciarDiagnostico.execute.mockResolvedValue(execucao);
    await expect(controller.iniciarDiagnostico('id-1', 'mec-1')).resolves.toEqual(
      execucao.toProps()
    );
    expect(iniciarDiagnostico.execute).toHaveBeenCalledWith('id-1', 'mec-1');
  });

  it('iniciarReparo repassa o id', async () => {
    iniciarReparo.execute.mockResolvedValue(execucao);
    await expect(controller.iniciarReparo('id-1')).resolves.toEqual(execucao.toProps());
    expect(iniciarReparo.execute).toHaveBeenCalledWith('id-1');
  });

  it('concluir repassa o id', async () => {
    concluir.execute.mockResolvedValue(execucao);
    await expect(controller.concluir('id-1')).resolves.toEqual(execucao.toProps());
    expect(concluir.execute).toHaveBeenCalledWith('id-1');
  });

  describe('autorizacao (RolesGuard real sobre os metadados do controller)', () => {
    const guard = new RolesGuard(new Reflector());
    const rotas = ['listar', 'iniciarDiagnostico', 'iniciarReparo', 'concluir'] as const;
    const contexto = (rota: (typeof rotas)[number], user: unknown): ExecutionContext =>
      ({
        getHandler: () => ExecucaoController.prototype[rota],
        getClass: () => ExecucaoController,
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
      }) as unknown as ExecutionContext;

    it.each(rotas)('%s aceita MECANICO', (rota) => {
      expect(guard.canActivate(contexto(rota, { id: 'mec-1', role: Role.MECANICO }))).toBe(true);
    });

    it.each(rotas)('%s devolve 403 para outro papel', (rota) => {
      expect(() => guard.canActivate(contexto(rota, { id: 'c-1', role: Role.CLIENTE }))).toThrow(
        ForbiddenException
      );
    });

    it.each(rotas)('%s devolve 403 para token sem role', (rota) => {
      expect(() => guard.canActivate(contexto(rota, { id: 'x-1' }))).toThrow(ForbiddenException);
    });
  });
});
