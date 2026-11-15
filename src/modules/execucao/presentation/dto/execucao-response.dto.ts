import { ApiProperty } from '@nestjs/swagger';
import { Execucao, ExecucaoStatus } from '../../domain/entities/execucao.entity';

export class ExecucaoResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  ordemServicoId: string;

  @ApiProperty({ enum: Object.values(ExecucaoStatus) })
  status: ExecucaoStatus;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'sub do JWT de quem iniciou o diagnostico',
  })
  responsavelId: string | null;

  @ApiProperty({ type: Date, nullable: true })
  diagnosticoIniciadoEm: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  reparoIniciadoEm: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  concluidaEm: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static from(execucao: Execucao): ExecucaoResponseDto {
    return Object.assign(new ExecucaoResponseDto(), execucao.toProps());
  }
}
