import { Module } from '@nestjs/common';
import { ExecucaoController } from './presentation/controllers/execucao.controller';

@Module({ controllers: [ExecucaoController] })
export class ExecucaoModule {}
