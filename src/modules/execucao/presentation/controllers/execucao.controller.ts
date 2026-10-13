import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { Role } from '../../../../auth/enums/role.enum';

// Rota de validacao da autenticacao local; as rotas de negocio entram na Feature de Fila e Dominio.
@Controller('execucao')
@ApiTags('Execucao')
@ApiBearerAuth()
export class ExecucaoController {
  @Get('me')
  @Roles(Role.MECANICO)
  @ApiOperation({ summary: 'Devolve o responsavelId (sub do token) do mecanico autenticado' })
  me(@CurrentUser('id') responsavelId: string): { responsavelId: string } {
    return { responsavelId };
  }
}
