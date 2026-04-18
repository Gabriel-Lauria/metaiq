import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { UiService } from '../../core/services/ui.service';
import { Manager, Role, Store, User } from '../../core/models';
import { roleBadgeTone, roleLabel } from '../../core/role-labels';
import { UiBadgeComponent } from '../../core/components/ui-badge.component';
import { UiStateComponent } from '../../core/components/ui-state.component';

@Component({
  selector: 'app-stores',
  standalone: true,
  imports: [CommonModule, FormsModule, UiBadgeComponent, UiStateComponent],
  templateUrl: './stores.component.html',
  styleUrls: ['./stores.component.scss']
})
export class StoresComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private ui = inject(UiService);
  private destroyRef = inject(DestroyRef);

  stores = signal<Store[]>([]);
  managers = signal<Manager[]>([]);
  users = signal<User[]>([]);
  linkedUsers = signal<User[]>([]);
  selectedStoreId = signal<string | null>(null);
  loading = signal(false);
  saving = signal(false);
  deleteTarget = signal<Store | null>(null);
  error = signal<string | null>(null);
  success = signal<string | null>(null);
  lastCreatedStoreName = signal<string | null>(null);
  name = '';
  cnpj = '';
  phone = '';
  email = '';
  active = true;
  notes = '';
  managerId = '';
  userId = '';
  isAdmin = computed(() => this.auth.getCurrentRole() === Role.PLATFORM_ADMIN);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    const storeRequest = [Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER].includes(this.auth.getCurrentRole())
      ? this.api.getStores()
      : this.api.getAccessibleStores();

    storeRequest
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: stores => {
          this.stores.set(stores);
          this.loading.set(false);
          if (!this.selectedStoreId() && stores.length) {
            this.selectStore(stores[0].id);
          }
        },
        error: err => {
          this.error.set(err.message);
          this.loading.set(false);
        }
      });

    this.api.getUsers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: users => this.users.set(users), error: err => this.error.set(err.message) });

    if (this.isAdmin()) {
      this.api.getManagers()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: managers => this.managers.set(managers), error: err => this.error.set(err.message) });
    }
  }

  create(): void {
    const trimmedName = this.name.trim();
    if (!trimmedName) return;
    if (this.isAdmin() && !this.managerId) {
      this.error.set('Selecione uma empresa para criar a loja.');
      return;
    }

    const body = this.isAdmin()
      ? { name: trimmedName, managerId: this.managerId }
      : { name: trimmedName };

    this.api.createStore(body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.name = '';
          this.cnpj = '';
          this.phone = '';
          this.email = '';
          this.active = true;
          this.notes = '';
          this.managerId = '';
          this.lastCreatedStoreName.set(trimmedName);
          this.success.set('Loja criada com sucesso.');
          this.saving.set(false);
          this.ui.showSuccess('Loja criada', 'Agora crie o cliente e vincule o gestor de tráfego.');
          this.load();
        },
        error: err => {
          this.error.set(err.message);
          this.saving.set(false);
          this.ui.showError('Não foi possível criar loja', err.message);
        }
      });
    this.saving.set(true);
  }

  toggle(store: Store): void {
    this.api.toggleStoreActive(store.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.success.set('Status da loja atualizado.');
          this.saving.set(false);
          this.ui.showSuccess('Status atualizado', `${store.name} foi ${store.active ? 'desativada' : 'ativada'}.`);
          this.load();
        },
        error: err => {
          this.error.set(err.message);
          this.saving.set(false);
          this.ui.showError('Não foi possível alterar status', err.message);
        }
      });
    this.saving.set(true);
  }

  askDelete(store: Store): void {
    this.deleteTarget.set(store);
    this.error.set(null);
  }

  cancelDelete(): void {
    this.deleteTarget.set(null);
  }

  confirmDelete(): void {
    const store = this.deleteTarget();
    if (!store) return;

    this.saving.set(true);
    this.api.deleteStore(store.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          if (this.selectedStoreId() === store.id) {
            this.selectedStoreId.set(null);
            this.linkedUsers.set([]);
          }

          this.deleteTarget.set(null);
          this.success.set('Loja excluída com segurança.');
          this.saving.set(false);
          this.ui.showSuccess('Loja excluída', `${store.name} foi removida das listagens.`);
          this.load();
        },
        error: err => {
          this.error.set(err.message);
          this.saving.set(false);
          this.ui.showError('Não foi possível excluir loja', err.message);
        }
      });
  }

  selectStore(storeId: string): void {
    this.selectedStoreId.set(storeId);
    this.api.getStoreUsers(storeId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: users => this.linkedUsers.set(users),
        error: err => this.error.set(err.message)
      });
  }

  link(): void {
    const storeId = this.selectedStoreId();
    if (!storeId || !this.userId) return;

    this.api.linkUserToStore(storeId, this.userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.userId = '';
          this.success.set('Usuário vinculado à loja.');
          this.ui.showSuccess('Usuário vinculado', 'O acesso à loja foi atualizado.');
          this.selectStore(storeId);
        },
        error: err => {
          this.error.set(err.message);
          this.ui.showError('Não foi possível vincular usuário', err.message);
        }
      });
  }

  unlink(user: User): void {
    const storeId = this.selectedStoreId();
    if (!storeId) return;

    this.api.unlinkUserFromStore(storeId, user.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.success.set('Vínculo removido.');
          this.ui.showSuccess('Vínculo removido', 'O usuário não acessa mais esta loja.');
          this.selectStore(storeId);
        },
        error: err => {
          this.error.set(err.message);
          this.ui.showError('Não foi possível remover vínculo', err.message);
        }
      });
  }

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }

  roleLabel(role: Role | string | null | undefined): string {
    return roleLabel(role);
  }

  roleTone(role: Role | string | null | undefined): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
    return roleBadgeTone(role);
  }

  selectedStore(): Store | null {
    const storeId = this.selectedStoreId();
    return this.stores().find(store => store.id === storeId) ?? null;
  }

  linkedClients(): User[] {
    return this.linkedUsers().filter(user => user.role === Role.CLIENT);
  }

  linkedTrafficManagers(): User[] {
    return this.linkedUsers().filter(user => user.role === Role.OPERATIONAL);
  }

  usersByRole(storeId: string, role: Role | string): string {
    if (this.selectedStoreId() !== storeId) {
      return 'Selecione para ver';
    }
    const names = this.linkedUsers()
      .filter(user => user.role === role)
      .map(user => user.name);
    return names.length ? names.join(', ') : 'Nenhum vínculo';
  }

  hasPreparedStoreFields(): boolean {
    return !!this.cnpj.trim() || !!this.phone.trim() || !!this.email.trim() || !!this.notes.trim() || !this.active;
  }
}
