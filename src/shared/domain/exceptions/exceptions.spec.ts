import { DomainException } from './domain.exception';
import { EntityNotFoundException } from './entity-not-found.exception';

describe('exceptions de dominio', () => {
  it('DomainException carrega mensagem e nome', () => {
    const e = new DomainException('regra violada');
    expect(e.message).toBe('regra violada');
    expect(e.name).toBe('DomainException');
  });

  it('EntityNotFoundException monta a mensagem e herda de DomainException', () => {
    const e = new EntityNotFoundException('Execucao', 'x-1');
    expect(e.message).toBe("Execucao with id 'x-1' not found");
    expect(e.name).toBe('EntityNotFoundException');
    expect(e).toBeInstanceOf(DomainException);
  });
});
