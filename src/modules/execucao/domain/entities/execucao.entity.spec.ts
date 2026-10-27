import { DomainException } from '../../../../shared/domain/exceptions/domain.exception';
import { Execucao, ExecucaoStatus } from './execucao.entity';

const T0 = new Date('2026-10-27T10:00:00.000Z');
const T1 = new Date('2026-10-27T11:00:00.000Z');

const emStatus = (status: ExecucaoStatus): Execucao =>
  Execucao.restaurar({ ...Execucao.criar('os-1', T0).toProps(), status });

const acoes: Record<string, (execucao: Execucao) => void> = {
  iniciarDiagnostico: (execucao) => execucao.iniciarDiagnostico('mec-1', T1),
  liberarParaReparo: (execucao) => execucao.liberarParaReparo(T1),
  iniciarReparo: (execucao) => execucao.iniciarReparo(T1),
  concluir: (execucao) => execucao.concluir(T1),
  cancelar: (execucao) => execucao.cancelar(T1),
};

const origensPermitidas: Record<string, ExecucaoStatus[]> = {
  iniciarDiagnostico: ['AGUARDANDO_DIAGNOSTICO'],
  liberarParaReparo: ['EM_DIAGNOSTICO'],
  iniciarReparo: ['AGUARDANDO_REPARO'],
  concluir: ['EM_REPARO'],
  cancelar: ['AGUARDANDO_DIAGNOSTICO', 'EM_DIAGNOSTICO', 'AGUARDANDO_REPARO'],
};

const transicoesInvalidas = Object.entries(origensPermitidas).flatMap(([acao, origens]) =>
  Object.values(ExecucaoStatus)
    .filter((status) => !origens.includes(status))
    .map((status) => [acao, status] as const)
);

describe('Execucao', () => {
  it('criar nasce em AGUARDANDO_DIAGNOSTICO sem responsavel nem marcos', () => {
    expect(Execucao.criar('os-1', T0).toProps()).toEqual({
      id: expect.any(String),
      ordemServicoId: 'os-1',
      status: 'AGUARDANDO_DIAGNOSTICO',
      responsavelId: null,
      diagnosticoIniciadoEm: null,
      reparoIniciadoEm: null,
      concluidaEm: null,
      createdAt: T0,
      updatedAt: T0,
    });
  });

  it('criar gera ids distintos', () => {
    expect(Execucao.criar('os-1').toProps().id).not.toBe(Execucao.criar('os-1').toProps().id);
  });

  it('iniciarDiagnostico grava responsavel e marco', () => {
    const execucao = emStatus('AGUARDANDO_DIAGNOSTICO');
    execucao.iniciarDiagnostico('mec-1', T1);
    expect(execucao.toProps()).toMatchObject({
      status: 'EM_DIAGNOSTICO',
      responsavelId: 'mec-1',
      diagnosticoIniciadoEm: T1,
      updatedAt: T1,
    });
  });

  it('liberarParaReparo vai a AGUARDANDO_REPARO', () => {
    const execucao = emStatus('EM_DIAGNOSTICO');
    execucao.liberarParaReparo(T1);
    expect(execucao.toProps()).toMatchObject({ status: 'AGUARDANDO_REPARO', updatedAt: T1 });
  });

  it('iniciarReparo grava o marco', () => {
    const execucao = emStatus('AGUARDANDO_REPARO');
    execucao.iniciarReparo(T1);
    expect(execucao.toProps()).toMatchObject({ status: 'EM_REPARO', reparoIniciadoEm: T1 });
  });

  it('concluir grava o marco', () => {
    const execucao = emStatus('EM_REPARO');
    execucao.concluir(T1);
    expect(execucao.toProps()).toMatchObject({ status: 'CONCLUIDA', concluidaEm: T1 });
  });

  it.each(origensPermitidas.cancelar)('cancelar a partir de %s vai a CANCELADA', (status) => {
    const execucao = emStatus(status);
    execucao.cancelar(T1);
    expect(execucao.toProps()).toMatchObject({ status: 'CANCELADA', updatedAt: T1 });
  });

  it.each(transicoesInvalidas)(
    '%s a partir de %s lanca DomainException sem mudar o estado',
    (acao, status) => {
      const execucao = emStatus(status);
      const antes = execucao.toProps();
      expect(() => acoes[acao](execucao)).toThrow(DomainException);
      expect(execucao.toProps()).toEqual(antes);
    }
  );

  it('rejeita EM_REPARO -> CANCELADA informando o status atual', () => {
    expect(() => emStatus('EM_REPARO').cancelar()).toThrow('Status atual: EM_REPARO');
  });

  it('toProps devolve copia, sem expor o estado interno', () => {
    const execucao = Execucao.criar('os-1', T0);
    execucao.toProps().status = 'CONCLUIDA';
    expect(execucao.toProps().status).toBe('AGUARDANDO_DIAGNOSTICO');
  });
});
