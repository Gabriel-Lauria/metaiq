import { HttpEventType } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { Asset } from '../../../core/models';
import { ImageUploadComponent } from './image-upload.component';

describe('ImageUploadComponent', () => {
  let fixture: ComponentFixture<ImageUploadComponent>;
  let component: ImageUploadComponent;
  let api: jasmine.SpyObj<ApiService>;

  const asset: Asset = {
    id: 'asset-1',
    storeId: 'store-1',
    type: 'image',
    mimeType: 'image/png',
    size: 1000,
    width: 1200,
    height: 628,
    storageUrl: 'https://cdn.metaiq.dev/asset-1.png',
    status: 'VALIDATED',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    api = jasmine.createSpyObj<ApiService>('ApiService', ['getAssets', 'uploadMetaImageAsset', 'deleteMetaImageAsset']);
    api.getAssets.and.returnValue(of([]));
    api.deleteMetaImageAsset.and.returnValue(of({ status: 'DELETED', message: 'Imagem removida com sucesso.' }));
    spyOn(URL, 'createObjectURL').and.returnValue('blob:preview');
    spyOn(URL, 'revokeObjectURL');

    await TestBed.configureTestingModule({
      imports: [ImageUploadComponent],
      providers: [{ provide: ApiService, useValue: api }],
    }).compileComponents();

    fixture = TestBed.createComponent(ImageUploadComponent);
    component = fixture.componentInstance;
    component.storeId = 'store-1';
    component.adAccountId = 'ad-account-1';
  });

  it('renderiza preview da imagem após upload com sucesso', () => {
    spyOn<any>(component, 'prepareLocalPreview').and.resolveTo();
    const upload$ = new Subject<any>();
    api.uploadMetaImageAsset.and.returnValue(upload$.asObservable());

    fixture.detectChanges();
    component.onFileInput({
      target: {
        files: [new File(['fake'], 'criativo.png', { type: 'image/png' })],
        value: '',
      },
    } as unknown as Event);

    upload$.next({ type: HttpEventType.UploadProgress, loaded: 50, total: 100 });
    upload$.next({ type: HttpEventType.Response, body: asset });
    upload$.complete();
    fixture.detectChanges();

    expect(api.uploadMetaImageAsset).toHaveBeenCalledWith(jasmine.any(File), 'store-1', 'ad-account-1');
    expect(component.progress()).toBe(100);
    expect(component.successMessage()).toBe('Imagem pronta para publicação');
    expect(fixture.nativeElement.querySelector('img')?.src).toContain(asset.storageUrl);
  });

  it('exibe erro amigável quando a API rejeita o arquivo', () => {
    spyOn<any>(component, 'prepareLocalPreview').and.resolveTo();
    api.uploadMetaImageAsset.and.returnValue(throwError(() => new Error('Imagem muito grande')));

    fixture.detectChanges();
    component.onFileInput({
      target: {
        files: [new File(['fake'], 'criativo.png', { type: 'image/png' })],
        value: '',
      },
    } as unknown as Event);
    fixture.detectChanges();

    expect(component.error()).toBe('Imagem muito grande (máx 4MB)');
  });

  it('renderiza biblioteca e permite selecionar uma imagem existente', () => {
    spyOn(component.assetSelected, 'emit');

    component.assets.set([asset]);
    component.selectedAssetId = asset.id;
    fixture.detectChanges();
    component.selectAsset(asset);
    fixture.detectChanges();

    expect(component.assetSelected.emit).toHaveBeenCalledWith(asset);
    expect(fixture.nativeElement.querySelector('img')?.src).toContain(asset.storageUrl);
  });

  it('trata ARCHIVED como sucesso e remove o asset da lista', () => {
    api.deleteMetaImageAsset.and.returnValue(of({
      status: 'ARCHIVED',
      message: 'Asset arquivado porque está vinculado a campanhas.',
    }));

    component.assets.set([asset]);
    component.deleteAsset(asset.id);

    expect(api.deleteMetaImageAsset).toHaveBeenCalledWith('store-1', asset.id);
    expect(component.assets()).toEqual([]);
    expect(component.successMessage()).toBe('Imagem arquivada com sucesso.');
    expect(component.error()).toBeNull();
  });
});
