import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../../core/services/api.service';
import { Manager } from '../../core/models';

@Component({
  selector: 'app-managers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './managers.component.html',
  styleUrls: ['./managers.component.scss']
})
export class ManagersComponent implements OnInit {
  private api = inject(ApiService);
  private destroyRef = inject(DestroyRef);

  managers = signal<Manager[]>([]);
  loading = signal(false);
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
          this.load();
        },
        error: err => this.error.set(err.message)
      });
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
          this.load();
        },
        error: err => this.error.set(err.message)
      });
  }

  toggle(manager: Manager): void {
    this.api.toggleManagerActive(manager.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.success.set('Status do manager atualizado.');
          this.load();
        },
        error: err => this.error.set(err.message)
      });
  }
}
