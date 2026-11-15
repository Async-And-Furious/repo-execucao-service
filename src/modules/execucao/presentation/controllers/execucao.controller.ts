import { Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { Role } from '../../../../auth/enums/role.enum';
import {
  ConcluirExecucaoUseCase,
  IniciarDiagnosticoUseCase,
  IniciarReparoUseCase,
  ListarFilaExecucaoUseCase,
} from '../../application/use-cases/execucao.use-cases';
import { ExecucaoResponseDto } from '../dto/execucao-response.dto';
import { ListarExecucoesQueryDto } from '../dto/listar-execucoes-query.dto';

@Controller('execucoes')
@ApiTags('Execucoes')
@ApiBearerAuth()
@Roles(Role.MECANICO)
export class ExecucaoController {
  constructor(
    private readonly listarFila: ListarFilaExecucaoUseCase,
    private readonly iniciarDiagnosticoUseCase: IniciarDiagnosticoUseCase,
    private readonly iniciarReparoUseCase: IniciarReparoUseCase,
    private readonly concluirUseCase: ConcluirExecucaoUseCase
  ) {}

  @Get()
  @ApiOperation({ summary: 'Fila de execucao por status, ordenada por createdAt' })
  @ApiOkResponse({ type: ExecucaoResponseDto, isArray: true })
  async listar(@Query() query: ListarExecucoesQueryDto): Promise<ExecucaoResponseDto[]> {
    const execucoes = await this.listarFila.execute(query);
    return execucoes.map((execucao) => ExecucaoResponseDto.from(execucao));
  }

  @Patch(':id/iniciar-diagnostico')
  @ApiOperation({ summary: 'AGUARDANDO_DIAGNOSTICO -> EM_DIAGNOSTICO; responsavel = sub do token' })
  @ApiOkResponse({ type: ExecucaoResponseDto })
  async iniciarDiagnostico(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') responsavelId: string
  ): Promise<ExecucaoResponseDto> {
    return ExecucaoResponseDto.from(
      await this.iniciarDiagnosticoUseCase.execute(id, responsavelId)
    );
  }

  @Patch(':id/iniciar-reparo')
  @ApiOperation({ summary: 'AGUARDANDO_REPARO -> EM_REPARO' })
  @ApiOkResponse({ type: ExecucaoResponseDto })
  async iniciarReparo(@Param('id', ParseUUIDPipe) id: string): Promise<ExecucaoResponseDto> {
    return ExecucaoResponseDto.from(await this.iniciarReparoUseCase.execute(id));
  }

  @Patch(':id/concluir')
  @ApiOperation({ summary: 'EM_REPARO -> CONCLUIDA' })
  @ApiOkResponse({ type: ExecucaoResponseDto })
  async concluir(@Param('id', ParseUUIDPipe) id: string): Promise<ExecucaoResponseDto> {
    return ExecucaoResponseDto.from(await this.concluirUseCase.execute(id));
  }
}
