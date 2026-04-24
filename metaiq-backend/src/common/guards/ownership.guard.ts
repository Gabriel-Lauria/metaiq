import { BadRequestException, Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isUUID } from 'class-validator';
import { AccessScopeService } from '../services/access-scope.service';
import {
  CHECK_OWNERSHIP_KEY,
  OwnershipMetadata,
} from '../decorators/check-ownership.decorator';

/**
 * OwnershipGuard verifica se o recurso acessado está no escopo do usuário autenticado.
 *
 * Uso:
 *   @Get(':id')
 *   @CheckOwnership('campaign', 'id')
 *   findOne(@Param('id') id: string) { ... }
 *
 * O guard:
 * 1. Lê metadata explícita do handler/classe via Reflector
 * 2. Extrai o id do parâmetro declarado no decorator
 * 3. Busca o recurso com filtro de escopo centralizado no AccessScopeService
 * 4. Nunca infere o tipo de recurso a partir da URL
 */
@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessScope: AccessScopeService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.reflector.getAllAndOverride<OwnershipMetadata>(
      CHECK_OWNERSHIP_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!metadata) {
      throw new ForbiddenException('OwnershipGuard sem metadata de recurso');
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const id = request.params?.[metadata.paramName];

    if (!user?.id) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    if (!id) {
      throw new ForbiddenException('ID do recurso não fornecido');
    }
    if (!isUUID(id)) {
      throw new BadRequestException('ID do recurso deve ser um UUID válido');
    }

    await this.accessScope.validateResourceAccess(user, metadata.resource, id);
    return true;
  }
}
