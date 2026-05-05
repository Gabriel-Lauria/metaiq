import { CommonModule } from '@angular/common';
import { HttpEventType } from '@angular/common/http';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject, signal } from '@angular/core';
import { Asset } from '../../../core/models';
import { ApiService } from '../../../core/services/api.service';

@Component({
  selector: 'app-image-upload',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-upload.component.html',
  styleUrl: './image-upload.component.scss',
})
export class ImageUploadComponent implements OnChanges, OnDestroy {
  private readonly api = inject(ApiService);
  private objectUrl: string | null = null;
  private readonly allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
  private readonly maxFileSizeBytes = 4 * 1024 * 1024;
  private readonly minWidth = 600;
  private readonly minHeight = 314;

  @Input() storeId: string | null = null;
  @Input() adAccountId: string | null = null;
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
  readonly localPreviewUrl = signal<string | null>(null);
  readonly localPreviewName = signal<string | null>(null);
  readonly localPreviewDimensions = signal<string | null>(null);
  readonly deleteConfirmAssetId = signal<string | null>(null);
  readonly deleteConfirmAssetName = signal<string | null>(null);
  readonly deleting = signal(false);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['storeId'] && this.storeId) {
      this.loadAssets();
    }
  }

  ngOnDestroy(): void {
    this.revokeObjectUrl();
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

  openDeleteConfirm(asset: Asset, event: Event): void {
    event.stopPropagation();
    this.deleteConfirmAssetId.set(asset.id);
    this.deleteConfirmAssetName.set(asset.originalName || asset.fileName || 'imagem');
  }

  closeDeleteConfirm(): void {
    this.deleteConfirmAssetId.set(null);
    this.deleteConfirmAssetName.set(null);
  }

  deleteAsset(assetId: string): void {
    if (!this.storeId) {
      this.error.set('Selecione uma store antes de deletar a imagem.');
      return;
    }

    this.deleting.set(true);
    this.error.set(null);
    this.successMessage.set(null);

    this.api.deleteMetaImageAsset(this.storeId, assetId).subscribe({
      next: (result) => {
        this.deleting.set(false);
        this.closeDeleteConfirm();
        this.assets.update((current) => current.filter((item) => item.id !== assetId));
        this.successMessage.set(
          result.status === 'ARCHIVED'
            ? 'Imagem arquivada com sucesso.'
            : (result.message || 'Imagem removida com sucesso.'),
        );
      },
      error: (err) => {
        this.deleting.set(false);
        this.error.set(err.message || 'Não foi possível remover a imagem.');
      },
    });
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

    if (!this.adAccountId) {
      this.error.set('Selecione a conta de anúncio antes de enviar a imagem.');
      return;
    }

    const validationError = this.validateBeforeUpload(file);
    if (validationError) {
      this.error.set(validationError);
      return;
    }

    this.error.set(null);
    this.successMessage.set(null);
    this.uploading.set(true);
    this.progress.set(0);
    void this.prepareLocalPreview(file);

    this.api.uploadMetaImageAsset(file, this.storeId, this.adAccountId).subscribe({
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
          this.successMessage.set('Imagem pronta para publicação');
          this.localPreviewUrl.set(asset.storageUrl);
          this.localPreviewName.set(asset.originalName || asset.fileName || 'Imagem enviada');
          this.localPreviewDimensions.set(asset.width && asset.height ? `${asset.width}x${asset.height}` : null);
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
    if (message.includes('Envie uma imagem válida para continuar')) {
      return 'Envie uma imagem válida para continuar.';
    }

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

  private validateBeforeUpload(file: File): string | null {
    if (!this.allowedMimeTypes.has(file.type)) {
      return 'Use uma imagem em JPG, PNG ou WEBP.';
    }

    if (file.size > this.maxFileSizeBytes) {
      return 'Imagem muito grande (máx 4MB)';
    }

    return null;
  }

  private async prepareLocalPreview(file: File): Promise<void> {
    this.revokeObjectUrl();
    const previewUrl = URL.createObjectURL(file);
    this.objectUrl = previewUrl;
    this.localPreviewUrl.set(previewUrl);
    this.localPreviewName.set(file.name);

    try {
      const { width, height } = await this.readImageDimensions(previewUrl);
      this.localPreviewDimensions.set(`${width}x${height}`);
      if (width < this.minWidth || height < this.minHeight) {
        this.error.set('Imagem muito pequena');
      }
    } catch {
      this.localPreviewDimensions.set(null);
    }
  }

  private readImageDimensions(url: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('preview-failed'));
      image.src = url;
    });
  }

  private revokeObjectUrl(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}
