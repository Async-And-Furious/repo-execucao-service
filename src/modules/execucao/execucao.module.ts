import { Module } from '@nestjs/common';
import {
  ConcluirExecucaoUseCase,
  IniciarDiagnosticoUseCase,
  IniciarReparoUseCase,
  ListarFilaExecucaoUseCase,
} from './application/use-cases/execucao.use-cases';
import {
  EXECUCAO_EVENT_PUBLISHER,
  IExecucaoEventPublisher,
} from './domain/ports/execucao-event-publisher';
import { EXECUCAO_REPOSITORY, IExecucaoRepository } from './domain/ports/execucao.repository';
import { LogExecucaoEventPublisher } from './infrastructure/publishers/log-execucao-event.publisher';
import { PrismaExecucaoRepository } from './infrastructure/repositories/prisma-execucao.repository';
import { ExecucaoController } from './presentation/controllers/execucao.controller';

const PORTAS = [EXECUCAO_REPOSITORY, EXECUCAO_EVENT_PUBLISHER];

@Module({
  controllers: [ExecucaoController],
  providers: [
    { provide: EXECUCAO_REPOSITORY, useClass: PrismaExecucaoRepository },
    { provide: EXECUCAO_EVENT_PUBLISHER, useClass: LogExecucaoEventPublisher },
    {
      provide: ListarFilaExecucaoUseCase,
      useFactory: (repo: IExecucaoRepository) => new ListarFilaExecucaoUseCase(repo),
      inject: [EXECUCAO_REPOSITORY],
    },
    {
      provide: IniciarDiagnosticoUseCase,
      useFactory: (repo: IExecucaoRepository, publisher: IExecucaoEventPublisher) =>
        new IniciarDiagnosticoUseCase(repo, publisher),
      inject: PORTAS,
    },
    {
      provide: IniciarReparoUseCase,
      useFactory: (repo: IExecucaoRepository, publisher: IExecucaoEventPublisher) =>
        new IniciarReparoUseCase(repo, publisher),
      inject: PORTAS,
    },
    {
      provide: ConcluirExecucaoUseCase,
      useFactory: (repo: IExecucaoRepository, publisher: IExecucaoEventPublisher) =>
        new ConcluirExecucaoUseCase(repo, publisher),
      inject: PORTAS,
    },
  ],
})
export class ExecucaoModule {}
