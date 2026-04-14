import { Injectable } from '@nestjs/common';

@Injectable()
export class CurrentUserService {
  /**
   * Retorna o payload do usuário autenticado presente no request.
   */
  getUser(request: any): any {
    return request?.user ?? null;
  }

  /**
   * Retorna o ID do usuário autenticado.
   */
  getUserId(request: any): string | null {
    const user = this.getUser(request);
    return user?.id ?? user?.sub ?? null;
  }

  /**
   * Retorna o campo solicitado do payload do usuário.
   * Útil quando o controlador precisa de um valor específico.
   */
  getUserField<T extends keyof any>(request: any, field: T): any {
    return this.getUser(request)?.[field] ?? null;
  }

  /**
   * Valida se o recurso pertence ao usuário autenticado.
   */
  isOwner(resourceOwnerId: string, request: any): boolean {
    const userId = this.getUserId(request);
    return Boolean(userId && resourceOwnerId && userId === resourceOwnerId);
  }
}
