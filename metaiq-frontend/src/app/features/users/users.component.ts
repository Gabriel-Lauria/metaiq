import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { UiService } from '../../core/services/ui.service';
import { Manager, Role, User } from '../../core/models';
import { roleBadgeTone, roleLabel } from '../../core/role-labels';
import { UiBadgeComponent } from '../../core/components/ui-badge.component';
import { UiStateComponent } from '../../core/components/ui-state.component';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule, UiBadgeComponent, UiStateComponent],
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.scss']
})
export class UsersComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private ui = inject(UiService);
  private destroyRef = inject(DestroyRef);

  users = signal<User[]>([]);
  managers = signal<Manager[]>([]);
  loading = signal(false);
  saving = signal(false);
  error = signal<string | null>(null);
  success = signal<string | null>(null);
  deleteTarget = signal<User | null>(null);
  name = '';
  email = '';
  password = '';
  role: Role = Role.OPERATIONAL;
  managerId = '';
  passwordUserId = '';
  newPassword = '';
  roles = [Role.OPERATIONAL, Role.CLIENT];
  adminRoles = [Role.MANAGER, Role.OPERATIONAL, Role.CLIENT];
  platformRoles = [Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER, Role.OPERATIONAL, Role.CLIENT];
  isPlatformAdmin = computed(() => this.auth.getCurrentRole() === Role.PLATFORM_ADMIN);
  isAdmin = computed(() => [Role.PLATFORM_ADMIN, Role.ADMIN].includes(this.auth.getCurrentRole() as Role));

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getUsers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: users => {
          this.users.set(users);
          this.loading.set(false);
        },
        error: err => {
          this.error.set(err.message);
          this.loading.set(false);
        }
      });

    if (this.isPlatformAdmin()) {
      this.api.getManagers()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: managers => this.managers.set(managers), error: err => this.error.set(err.message) });
    }
  }

  create(): void {
    if (!this.name.trim() || !this.email.trim() || !this.password.trim()) {
      this.error.set('Preencha nome, email e senha.');
      return;
    }
    if (this.isPlatformAdmin() && ![Role.PLATFORM_ADMIN, Role.ADMIN].includes(this.role) && !this.managerId) {
      this.error.set('Selecione uma empresa para este usuário.');
      return;
    }

    const body = {
      name: this.name.trim(),
      email: this.email.trim(),
      password: this.password,
      role: this.role,
      managerId: this.isPlatformAdmin() ? this.managerId || undefined : undefined,
    };

    this.api.createUser(body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.name = '';
          this.email = '';
          this.password = '';
          this.role = Role.OPERATIONAL;
          this.managerId = '';
          this.success.set('Usuário criado com sucesso.');
          this.saving.set(false);
          this.ui.showSuccess('Usuário criado', 'O acesso já está disponível para a empresa.');
          this.load();
        },
        error: err => {
          this.error.set(err.message);
          this.saving.set(false);
          this.ui.showError('Não foi possível criar usuário', err.message);
        }
      });
    this.saving.set(true);
  }

  resetPassword(): void {
    if (!this.isPlatformAdmin() || !this.passwordUserId || !this.newPassword.trim()) {
      this.error.set('Selecione um usuário e informe a nova senha.');
      return;
    }

    this.api.resetUserPassword(this.passwordUserId, { password: this.newPassword })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.passwordUserId = '';
          this.newPassword = '';
          this.success.set('Senha alterada com sucesso.');
          this.saving.set(false);
          this.ui.showSuccess('Senha alterada', 'A nova senha já pode ser usada no login.');
          this.load();
        },
        error: err => {
          this.error.set(err.message);
          this.saving.set(false);
          this.ui.showError('Não foi possível alterar senha', err.message);
        }
      });
    this.saving.set(true);
  }

  askDelete(user: User): void {
    this.deleteTarget.set(user);
  }

  cancelDelete(): void {
    this.deleteTarget.set(null);
  }

  confirmDelete(): void {
    const user = this.deleteTarget();
    if (!user) return;

    this.api.deleteUser(user.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleteTarget.set(null);
          this.success.set('Usuário excluído com segurança.');
          this.saving.set(false);
          this.ui.showSuccess('Usuário excluído', 'O acesso foi removido e os vínculos com lojas foram limpos.');
          this.load();
        },
        error: err => {
          this.error.set(err.message);
          this.saving.set(false);
          this.ui.showError('Não foi possível excluir usuário', err.message);
        }
      });
    this.saving.set(true);
  }

  canDelete(user: User): boolean {
    return user.role !== Role.PLATFORM_ADMIN;
  }

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }

  trackByRole(_: number, role: Role): Role {
    return role;
  }

  roleLabel(role: Role | string | null | undefined): string {
    return roleLabel(role);
  }

  roleTone(role: Role | string | null | undefined): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
    return roleBadgeTone(role);
  }
}
