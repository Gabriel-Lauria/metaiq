import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ApiService } from './api.service';
import { CreateMetaCampaignRequest } from '../models';

describe('ApiService retry policy', () => {
  const payload: CreateMetaCampaignRequest = {
    name: 'Campanha segura',
    objective: 'OUTCOME_TRAFFIC',
    dailyBudget: 100,
    startTime: '2026-05-01T10:00:00.000Z',
    country: 'BR',
    adAccountId: 'ad-account-1',
    message: 'Mensagem principal',
    imageUrl: 'https://metaiq.dev/image.jpg',
    destinationUrl: 'https://metaiq.dev/oferta',
  };

  let service: ApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ApiService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('nao faz retry automatico quando a Meta retorna 400 na criacao', fakeAsync(() => {
    let capturedError: unknown;

    service.createMetaCampaign('store-1', payload).subscribe({
      next: () => fail('nao deveria concluir com sucesso'),
      error: (error) => {
        capturedError = error;
      },
    });

    const request = httpMock.expectOne((req) =>
      req.method === 'POST' && req.url.includes('/integrations/meta/stores/store-1/campaigns'),
    );
    request.flush(
      { message: 'Erro na criação do criativo: destination_url inválido', executionStatus: 'PARTIAL' },
      { status: 400, statusText: 'Bad Request' },
    );

    tick(5000);

    expect(capturedError).toEqual(jasmine.objectContaining({
      status: 400,
    }));
  }));

  it('faz retry automatico em 5xx e retorna sucesso sem duplicar a intencao da requisicao', fakeAsync(() => {
    let response: unknown;

    service.createMetaCampaign('store-1', payload).subscribe({
      next: (value) => {
        response = value;
      },
      error: (error) => fail(`nao deveria falhar: ${JSON.stringify(error)}`),
    });

    const first = httpMock.expectOne((req) =>
      req.method === 'POST' && req.url.includes('/integrations/meta/stores/store-1/campaigns'),
    );
    first.flush({ message: 'gateway failure' }, { status: 502, statusText: 'Bad Gateway' });

    tick(1000);

    const second = httpMock.expectOne((req) =>
      req.method === 'POST' && req.url.includes('/integrations/meta/stores/store-1/campaigns'),
    );
    second.flush({ message: 'gateway failure again' }, { status: 503, statusText: 'Service Unavailable' });

    tick(2000);

    const third = httpMock.expectOne((req) =>
      req.method === 'POST' && req.url.includes('/integrations/meta/stores/store-1/campaigns'),
    );
    third.flush({
      campaignId: 'cmp-1',
      adSetId: 'adset-1',
      creativeId: 'creative-1',
      adId: 'ad-1',
      status: 'CREATED',
      executionStatus: 'COMPLETED',
      storeId: 'store-1',
      adAccountId: 'ad-account-1',
      platform: 'META',
    });

    expect(response).toEqual(jasmine.objectContaining({
      campaignId: 'cmp-1',
      executionStatus: 'COMPLETED',
    }));
  }));

  it('faz retry automatico em timeout da criacao', fakeAsync(() => {
    let response: unknown;

    service.createMetaCampaign('store-1', payload).subscribe({
      next: (value) => {
        response = value;
      },
      error: (error) => fail(`nao deveria falhar: ${JSON.stringify(error)}`),
    });

    const first = httpMock.expectOne((req) =>
      req.method === 'POST' && req.url.includes('/integrations/meta/stores/store-1/campaigns'),
    );
    tick(15000);
    expect(first.cancelled).toBeTrue();

    tick(1000);
    const second = httpMock.expectOne((req) =>
      req.method === 'POST' && req.url.includes('/integrations/meta/stores/store-1/campaigns'),
    );
    tick(15000);
    expect(second.cancelled).toBeTrue();

    tick(2000);
    const third = httpMock.expectOne((req) =>
      req.method === 'POST' && req.url.includes('/integrations/meta/stores/store-1/campaigns'),
    );
    third.flush({
      campaignId: 'cmp-timeout',
      adSetId: 'adset-timeout',
      creativeId: 'creative-timeout',
      adId: 'ad-timeout',
      status: 'CREATED',
      executionStatus: 'COMPLETED',
      storeId: 'store-1',
      adAccountId: 'ad-account-1',
      platform: 'META',
    });

    expect(response).toEqual(jasmine.objectContaining({
      campaignId: 'cmp-timeout',
      executionStatus: 'COMPLETED',
    }));
  }));
});
