import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { Manager, Role, Store, User } from '../../core/models';

@Component({
  selector: 'app-stores',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './stores.component.html',
  styleUrls: ['./stores.component.scss']
})
export class StoresComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private destroyRef = inject(DestroyRef);

  stores = signal<Store[]>([]);
  managers = signal<Manager[]>([]);
  users = signal<User[]>([]);
  linkedUsers = signal<User[]>([]);
  selectedStoreId = signal<string | null>(null);
  loading = signal(false);
  error = signal<string | null>(null);
  success = signal<string | null>(null);
  name = '';
  managerId = '';
  userId = '';
  isAdmin = computed(() => this.auth.getCurrentRole() === Role.ADMIN);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getStores()
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
      this.error.set('Selecione um manager para criar a store.');
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
          this.managerId = '';
          this.success.set('Store criada com sucesso.');
          this.load();
        },
        error: err => this.error.set(err.message)
      });
  }

  toggle(store: Store): void {
    this.api.toggleStoreActive(store.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.success.set('Status da store atualizado.');
          this.load();
        },
        error: err => this.error.set(err.message)
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
          this.success.set('Usuário vinculado à store.');
          this.selectStore(storeId);
        },
        error: err => this.error.set(err.message)
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
          this.selectStore(storeId);
        },
        error: err => this.error.set(err.message)
      });
  }
}
