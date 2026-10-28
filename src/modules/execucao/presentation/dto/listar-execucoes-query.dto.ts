import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ExecucaoStatus } from '../../domain/entities/execucao.entity';

export class ListarExecucoesQueryDto {
  @ApiPropertyOptional({
    enum: Object.values(ExecucaoStatus),
    description: 'Sem status, lista AGUARDANDO_DIAGNOSTICO e AGUARDANDO_REPARO',
  })
  @IsOptional()
  @IsIn(Object.values(ExecucaoStatus))
  status?: ExecucaoStatus;

  @ApiPropertyOptional({ description: 'sub do JWT do mecanico responsavel' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  responsavelId?: string;
}
