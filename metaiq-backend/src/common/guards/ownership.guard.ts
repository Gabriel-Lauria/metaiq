import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

/**
 * OwnershipGuard verifica se o recurso acessado pertence ao usuário autenticado.
 *
 * Uso:
 *   @Get(':id')
 *   @UseGuards(OwnershipGuard)
 *   findOne(@Param('id') id: string) { ... }
 *
 * O guard:
 * 1. Extrai o id do parâmetro de rota
 * 2. Busca o recurso no banco
 * 3. Verifica se userId do recurso == userId do JWT
 * 4. Permite se forem iguais, nega caso contrário
 */
@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(
    @InjectRepository('Campaign')
    private campaignRepo?: Repository<any>,
    @InjectRepository('Insight')
    private insightRepo?: Repository<any>,
    @InjectRepository('AdAccount')
    private adAccountRepo?: Repository<any>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const { id } = request.params;

    if (!user || !user.sub) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    if (!id) {
      throw new ForbiddenException('ID do recurso não fornecido');
    }

    // Determina qual repositório usar baseado na rota
    const route = request.path.split('/')[1]; // ex: 'campaigns', 'insights'
    let repository: Repository<any> | undefined;

    switch (route) {
      case 'campaigns':
        repository = this.campaignRepo;
        break;
      case 'insights':
        repository = this.insightRepo;
        break;
      case 'ad-accounts':
        repository = this.adAccountRepo;
        break;
      default:
        // Se não conseguir determinar, retorna true (guard passivo)
        return true;
    }

    if (!repository) {
      return true;
    }

    // Busca o recurso
    const resource = await repository.findOne({
      where: { id },
    });

    if (!resource) {
      throw new NotFoundException(`Recurso não encontrado`);
    }

    // Verifica ownership
    if (resource.userId !== user.sub && resource.userId !== user.id) {
      throw new ForbiddenException(
        'Você não tem permissão para acessar este recurso',
      );
    }

    return true;
  }
}
