import { DomainException } from '../../../../shared/domain/exceptions/domain.exception';
import { EntityNotFoundException } from '../../../../shared/domain/exceptions/entity-not-found.exception';
import { Execucao, ExecucaoStatus } from '../../domain/entities/execucao.entity';
import {
  DiagnosticoIniciado,
  ExecucaoConcluida,
  ExecucaoIniciada,
} from '../../domain/events/execucao.events';
import { IExecucaoEventPublisher } from '../../domain/ports/execucao-event-publisher';
import { IExecucaoRepository } from '../../domain/ports/execucao.repository';
import {
  ConcluirExecucaoUseCase,
  IniciarDiagnosticoUseCase,
  IniciarReparoUseCase,
  ListarFilaExecucaoUseCase,
} from './execucao.use-cases';

const AGORA = new Date('2026-10-27T12:00:00.000Z');

const emStatus = (status: ExecucaoStatus, responsavelId: string | null = null): Execucao =>
  Execucao.restaurar({
    ...Execucao.criar('os-1', new Date('2026-10-27T09:00:00.000Z')).toProps(),
    status,
    responsavelId,
  });

describe('use cases de Execucao', () => {
  let repo: jest.Mocked<IExecucaoRepository>;
  let publisher: jest.Mocked<IExecucaoEventPublisher>;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(AGORA);
    repo = {
      create: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(),
      listar: jest.fn(),
    };
    publisher = { publish: jest.fn() };
  });

  afterEach(() => jest.useRealTimers());

  describe('IniciarDiagnosticoUseCase', () => {
    const useCase = () => new IniciarDiagnosticoUseCase(repo, publisher);

    it('grava o responsavel, salva e publica DiagnosticoIniciado', async () => {
      const execucao = emStatus('AGUARDANDO_DIAGNOSTICO');
      repo.findById.mockResolvedValue(execucao);

      const resultado = await useCase().execute(execucao.toProps().id, 'mec-1');

      expect(resultado.toProps()).toMatchObject({
        status: 'EM_DIAGNOSTICO',
        responsavelId: 'mec-1',
        diagnosticoIniciadoEm: AGORA,
      });
      expect(repo.save).toHaveBeenCalledWith(execucao);
      const evento = publisher.publish.mock.calls[0][0];
      expect(evento).toBeInstanceOf(DiagnosticoIniciado);
      expect(evento.correlationId).toBe('os-1');
      expect(evento.data).toEqual({
        execucaoId: execucao.toProps().id,
        ordemServicoId: 'os-1',
        responsavelId: 'mec-1',
        diagnosticoIniciadoEm: AGORA.toISOString(),
      });
    });

    it('lanca EntityNotFoundException quando a execucao nao existe', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(useCase().execute('x', 'mec-1')).rejects.toBeInstanceOf(EntityNotFoundException);
      expect(repo.save).not.toHaveBeenCalled();
      expect(publisher.publish).not.toHaveBeenCalled();
    });

    it('nao salva nem publica em transicao invalida', async () => {
      repo.findById.mockResolvedValue(emStatus('EM_DIAGNOSTICO', 'mec-1'));
      await expect(useCase().execute('id', 'mec-2')).rejects.toBeInstanceOf(DomainException);
      expect(repo.save).not.toHaveBeenCalled();
      expect(publisher.publish).not.toHaveBeenCalled();
    });
  });

  describe('IniciarReparoUseCase', () => {
    const useCase = () => new IniciarReparoUseCase(repo, publisher);

    it('vai a EM_REPARO e publica ExecucaoIniciada', async () => {
      const execucao = emStatus('AGUARDANDO_REPARO', 'mec-1');
      repo.findById.mockResolvedValue(execucao);

      const resultado = await useCase().execute(execucao.toProps().id);

      expect(resultado.toProps()).toMatchObject({ status: 'EM_REPARO', reparoIniciadoEm: AGORA });
      expect(repo.save).toHaveBeenCalledWith(execucao);
      const evento = publisher.publish.mock.calls[0][0];
      expect(evento).toBeInstanceOf(ExecucaoIniciada);
      expect(evento.data).toEqual({
        execucaoId: execucao.toProps().id,
        ordemServicoId: 'os-1',
        responsavelId: 'mec-1',
        reparoIniciadoEm: AGORA.toISOString(),
      });
    });

    it('so aceita AGUARDANDO_REPARO', async () => {
      repo.findById.mockResolvedValue(emStatus('EM_DIAGNOSTICO', 'mec-1'));
      await expect(useCase().execute('id')).rejects.toBeInstanceOf(DomainException);
      expect(publisher.publish).not.toHaveBeenCalled();
    });

    it('lanca EntityNotFoundException quando a execucao nao existe', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(useCase().execute('x')).rejects.toBeInstanceOf(EntityNotFoundException);
    });
  });

  describe('ConcluirExecucaoUseCase', () => {
    const useCase = () => new ConcluirExecucaoUseCase(repo, publisher);

    it('vai a CONCLUIDA, registra o marco e publica ExecucaoConcluida', async () => {
      const execucao = emStatus('EM_REPARO', 'mec-1');
      repo.findById.mockResolvedValue(execucao);

      const resultado = await useCase().execute(execucao.toProps().id);

      expect(resultado.toProps()).toMatchObject({ status: 'CONCLUIDA', concluidaEm: AGORA });
      expect(repo.save).toHaveBeenCalledWith(execucao);
      const evento = publisher.publish.mock.calls[0][0];
      expect(evento).toBeInstanceOf(ExecucaoConcluida);
      expect(evento.data).toEqual({
        execucaoId: execucao.toProps().id,
        ordemServicoId: 'os-1',
        responsavelId: 'mec-1',
        concluidaEm: AGORA.toISOString(),
      });
    });

    it('so aceita EM_REPARO', async () => {
      repo.findById.mockResolvedValue(emStatus('AGUARDANDO_REPARO', 'mec-1'));
      await expect(useCase().execute('id')).rejects.toBeInstanceOf(DomainException);
      expect(publisher.publish).not.toHaveBeenCalled();
    });

    it('lanca EntityNotFoundException quando a execucao nao existe', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(useCase().execute('x')).rejects.toBeInstanceOf(EntityNotFoundException);
    });
  });

  describe('ListarFilaExecucaoUseCase', () => {
    const useCase = () => new ListarFilaExecucaoUseCase(repo);

    it('sem status lista as duas faixas de espera', async () => {
      repo.listar.mockResolvedValue([]);
      await useCase().execute({});
      expect(repo.listar).toHaveBeenCalledWith({
        status: ['AGUARDANDO_DIAGNOSTICO', 'AGUARDANDO_REPARO'],
        responsavelId: undefined,
      });
    });

    it('com status e responsavel repassa os dois', async () => {
      const lista = [emStatus('EM_REPARO', 'mec-1')];
      repo.listar.mockResolvedValue(lista);
      await expect(
        useCase().execute({ status: 'EM_REPARO', responsavelId: 'mec-1' })
      ).resolves.toBe(lista);
      expect(repo.listar).toHaveBeenCalledWith({ status: ['EM_REPARO'], responsavelId: 'mec-1' });
    });
  });
});
