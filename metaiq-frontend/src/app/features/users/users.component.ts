import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { Manager, Role, User } from '../../core/models';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.scss']
})
export class UsersComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private destroyRef = inject(DestroyRef);

  users = signal<User[]>([]);
  managers = signal<Manager[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  success = signal<string | null>(null);
  name = '';
  email = '';
  password = '';
  role: Role = Role.OPERATIONAL;
  managerId = '';
  passwordUserId = '';
  newPassword = '';
  roles = [Role.OPERATIONAL, Role.CLIENT];
  adminRoles = [Role.ADMIN, Role.MANAGER, Role.OPERATIONAL, Role.CLIENT];
  isAdmin = computed(() => this.auth.getCurrentRole() === Role.ADMIN);

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

    if (this.isAdmin()) {
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
    if (this.isAdmin() && this.role !== Role.ADMIN && !this.managerId) {
      this.error.set('Selecione um manager para usuário não-admin.');
      return;
    }

    const body = {
      name: this.name.trim(),
      email: this.email.trim(),
      password: this.password,
      role: this.role,
      managerId: this.isAdmin() ? this.managerId || undefined : undefined,
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
          this.load();
        },
        error: err => this.error.set(err.message)
      });
  }

  resetPassword(): void {
    if (!this.isAdmin() || !this.passwordUserId || !this.newPassword.trim()) {
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
          this.load();
        },
        error: err => this.error.set(err.message)
      });
  }
}
