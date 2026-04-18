import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/services/api.service';
import { UiService } from '../../core/services/ui.service';
import { Manager } from '../../core/models';
import { UiBadgeComponent } from '../../core/components/ui-badge.component';
import { UiStateComponent } from '../../core/components/ui-state.component';

@Component({
  selector: 'app-managers',
  standalone: true,
  imports: [CommonModule, FormsModule, UiBadgeComponent, UiStateComponent],
  templateUrl: './managers.component.html',
  styleUrls: ['./managers.component.scss']
})
export class ManagersComponent implements OnInit {
  private api = inject(ApiService);
  private ui = inject(UiService);
  private destroyRef = inject(DestroyRef);

  managers = signal<Manager[]>([]);
  loading = signal(false);
  saving = signal(false);
  error = signal<string | null>(null);
  success = signal<string | null>(null);
  deleteTarget = signal<Manager | null>(null);
  name = '';
  cnpj = '';
  phone = '';
  email = '';
  contactName = '';
  notes = '';
  editingId: string | null = null;
  editingName = '';
  editingCnpj = '';
  editingPhone = '';
  editingEmail = '';
  editingContactName = '';
  editingNotes = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getManagers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: managers => {
          this.managers.set(managers);
          this.loading.set(false);
        },
        error: err => {
          this.error.set(err.message);
          this.loading.set(false);
        }
      });
  }

  create(): void {
    const trimmedName = this.name.trim();
    if (!trimmedName) return;

    this.api.createManager({
      name: trimmedName,
      cnpj: this.clean(this.cnpj),
      phone: this.clean(this.phone),
      email: this.clean(this.email),
      contactName: this.clean(this.contactName),
      notes: this.clean(this.notes),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.name = '';
          this.cnpj = '';
          this.phone = '';
          this.email = '';
          this.contactName = '';
          this.notes = '';
          this.success.set('Empresa criada com sucesso.');
          this.saving.set(false);
          this.ui.showSuccess('Empresa criada', 'A empresa já está disponível para configurar usuários e lojas.');
          this.load();
        },
        error: err => {
          this.error.set(err.message);
          this.saving.set(false);
          this.ui.showError('Não foi possível criar empresa', err.message);
        }
      });
    this.saving.set(true);
  }

  startEdit(manager: Manager): void {
    this.editingId = manager.id;
    this.editingName = manager.name;
    this.editingCnpj = manager.cnpj ?? '';
    this.editingPhone = manager.phone ?? '';
    this.editingEmail = manager.email ?? '';
    this.editingContactName = manager.contactName ?? '';
    this.editingNotes = manager.notes ?? '';
  }

  saveEdit(manager: Manager): void {
    const trimmedName = this.editingName.trim();
    if (!trimmedName) return;

    this.api.updateManager(manager.id, {
      name: trimmedName,
      cnpj: this.clean(this.editingCnpj),
      phone: this.clean(this.editingPhone),
      email: this.clean(this.editingEmail),
      contactName: this.clean(this.editingContactName),
      notes: this.clean(this.editingNotes),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.editingId = null;
          this.success.set('Empresa atualizada.');
          this.saving.set(false);
          this.ui.showSuccess('Empresa atualizada', 'As alterações foram salvas.');
          this.load();
        },
        error: err => {
          this.error.set(err.message);
          this.saving.set(false);
          this.ui.showError('Não foi possível salvar', err.message);
        }
      });
    this.saving.set(true);
  }

  cancelEdit(): void {
    this.editingId = null;
    this.editingName = '';
    this.editingCnpj = '';
    this.editingPhone = '';
    this.editingEmail = '';
    this.editingContactName = '';
    this.editingNotes = '';
  }

  toggle(manager: Manager): void {
    this.api.toggleManagerActive(manager.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.success.set('Status da empresa atualizado.');
          this.saving.set(false);
          this.ui.showSuccess('Status atualizado', `${manager.name} foi ${manager.active ? 'desativado' : 'ativado'}.`);
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

  askDelete(manager: Manager): void {
    this.deleteTarget.set(manager);
  }

  cancelDelete(): void {
    this.deleteTarget.set(null);
  }

  confirmDelete(): void {
    const manager = this.deleteTarget();
    if (!manager) return;

    this.saving.set(true);
    this.api.deleteManager(manager.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deleteTarget.set(null);
          this.success.set('Empresa excluída com segurança.');
          this.saving.set(false);
          this.ui.showSuccess('Empresa excluída', 'A empresa foi removida da listagem.');
          this.load();
        },
        error: err => {
          this.error.set(err.message);
          this.saving.set(false);
          this.ui.showError('Não foi possível excluir empresa', err.message);
        }
      });
  }

  trackById(_: number, manager: Manager): string {
    return manager.id;
  }

  private clean(value: string): string | null {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
}
