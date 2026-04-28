import { CommonModule } from '@angular/common';
import { HttpEventType } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal } from '@angular/core';
import { Asset } from '../../../core/models';
import { ApiService } from '../../../core/services/api.service';

@Component({
  selector: 'app-image-upload',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-upload.component.html',
  styleUrl: './image-upload.component.scss',
})
export class ImageUploadComponent implements OnChanges {
  private readonly api = inject(ApiService);

  @Input() storeId: string | null = null;
  @Input() selectedAssetId: string | null = null;
  @Output() assetSelected = new EventEmitter<Asset>();
  @Output() cleared = new EventEmitter<void>();

  readonly assets = signal<Asset[]>([]);
  readonly loading = signal(false);
  readonly uploading = signal(false);
  readonly progress = signal(0);
  readonly error = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly dragActive = signal(false);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['storeId'] && this.storeId) {
      this.loadAssets();
    }
  }

  onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.upload(file);
    }
    input.value = '';
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      this.upload(file);
    }
  }

  selectAsset(asset: Asset): void {
    this.error.set(null);
    this.successMessage.set(null);
    this.assetSelected.emit(asset);
  }

  clearSelection(): void {
    this.successMessage.set(null);
    this.error.set(null);
    this.cleared.emit();
  }

  trackByAssetId(_index: number, asset: Asset): string {
    return asset.id;
  }

  isSelected(asset: Asset): boolean {
    return asset.id === this.selectedAssetId;
  }

  private loadAssets(): void {
    if (!this.storeId) {
      this.assets.set([]);
      return;
    }

    this.loading.set(true);
    this.api.getAssets(this.storeId, 'image').subscribe({
      next: (assets) => {
        this.assets.set(assets);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.message || 'Não foi possível carregar a biblioteca de imagens.');
      },
    });
  }

  private upload(file: File): void {
    if (!this.storeId) {
      this.error.set('Selecione uma store antes de enviar a imagem.');
      return;
    }

    this.error.set(null);
    this.successMessage.set(null);
    this.uploading.set(true);
    this.progress.set(0);

    this.api.uploadAsset(file, this.storeId).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress) {
          const total = event.total || file.size || 1;
          this.progress.set(Math.round((event.loaded / total) * 100));
          return;
        }

        if (event.type === HttpEventType.Response && event.body) {
          const asset = event.body;
          this.uploading.set(false);
          this.progress.set(100);
          this.successMessage.set('Imagem enviada com sucesso');
          this.assets.update((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
          this.assetSelected.emit(asset);
        }
      },
      error: (err) => {
        this.uploading.set(false);
        this.progress.set(0);
        this.error.set(this.normalizeErrorMessage(err?.message || 'Não foi possível enviar a imagem.'));
      },
    });
  }

  private normalizeErrorMessage(message: string): string {
    if (message.includes('Imagem muito grande')) {
      return 'Imagem muito grande (máx 4MB)';
    }

    if (message.includes('Formato inválido')) {
      return 'Formato não suportado';
    }

    if (message.includes('Imagem muito pequena')) {
      return 'Imagem muito pequena';
    }

    return message;
  }
}
