import { Role } from './models';

export function roleLabel(role: Role | string | null | undefined): string {
  switch (role) {
    case Role.PLATFORM_ADMIN:
      return 'Administrador da Plataforma';
    case Role.ADMIN:
      return 'Administrador da Empresa';
    case Role.MANAGER:
      return 'Supervisor de Tráfego';
    case Role.OPERATIONAL:
      return 'Gestor de Tráfego';
    case Role.CLIENT:
      return 'Cliente';
    default:
      return 'Usuário';
  }
}

export function roleBadgeTone(role: Role | string | null | undefined): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  switch (role) {
    case Role.PLATFORM_ADMIN:
    case Role.ADMIN:
      return 'danger';
    case Role.MANAGER:
      return 'info';
    case Role.CLIENT:
      return 'warning';
    case Role.OPERATIONAL:
      return 'success';
    default:
      return 'neutral';
  }
}
