import { ExecucaoController } from './execucao.controller';

describe('ExecucaoController', () => {
  it('devolve o sub do token como responsavelId', () => {
    expect(new ExecucaoController().me('mec-1')).toEqual({ responsavelId: 'mec-1' });
  });
});
