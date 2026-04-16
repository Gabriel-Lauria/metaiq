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
  name = '';
  editingId: string | null = null;
  editingName = '';

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

    this.api.createManager({ name: trimmedName })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.name = '';
          this.success.set('Manager criado com sucesso.');
          this.saving.set(false);
          this.ui.showSuccess('Manager criado', 'O tenant já está disponível para operação.');
          this.load();
        },
        error: err => {
          this.error.set(err.message);
          this.saving.set(false);
          this.ui.showError('Não foi possível criar manager', err.message);
        }
      });
    this.saving.set(true);
  }

  startEdit(manager: Manager): void {
    this.editingId = manager.id;
    this.editingName = manager.name;
  }

  saveEdit(manager: Manager): void {
    const trimmedName = this.editingName.trim();
    if (!trimmedName) return;

    this.api.updateManager(manager.id, { name: trimmedName })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.editingId = null;
          this.success.set('Manager atualizado.');
          this.saving.set(false);
          this.ui.showSuccess('Manager atualizado', 'As alterações foram salvas.');
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

  toggle(manager: Manager): void {
    this.api.toggleManagerActive(manager.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.success.set('Status do manager atualizado.');
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

  trackById(_: number, manager: Manager): string {
    return manager.id;
  }
}
