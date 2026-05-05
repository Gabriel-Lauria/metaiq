import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpEvent, HttpParams } from '@angular/common/http';
import { Observable, throwError, timer } from 'rxjs';
import { timeout, retry, catchError } from 'rxjs/operators';
import {
  Campaign,
  MetricDaily,
  AggregatedMetrics,
  Insight,
  AdAccount,
  Manager,
  Store,
  User,
  UserStore,
  CreateManagerRequest,
  UpdateManagerRequest,
  CreateStoreRequest,
  UpdateStoreRequest,
  CreateUserRequest,
  ResetUserPasswordRequest,
  DashboardSummary,
  StoreIntegration,
  MetaOAuthStartResponse,
  MetaAdAccount,
  MetaPage,
  ConnectMetaIntegrationRequest,
  CreateMetaCampaignRequest,
  CreateMetaCampaignResponse,
  MetaCampaignRecoveryResponse,
  MetaCampaignRecoveryStatusResponse,
  UpdateCampaignRequest,
  UpdateMetaPageRequest,
  UpdateMetaIntegrationStatusRequest,
  IbgeCity,
  IbgeState,
  CompanyProfilePayload,
  Asset,
  AssetType,
} from '../models';
import { environment } from '../environment';

const API = environment.apiUrl;
const HTTP_TIMEOUT = 15000;
const RETRY_ATTEMPTS = 2;
const RETRY_DELAY = 1000;

// Interfaces para paginação
export interface PaginationDto {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

type ApiErrorShape = {
  status?: number;
  message?: string;
  error?: string;
  step?: string;
  executionId?: string;
  executionStatus?: string;
  partialIds?: Record<string, unknown>;
  metaError?: Record<string, unknown>;
  hint?: string;
  details?: unknown;
  originalError?: unknown;
};

function dateRange(days = 30): { from: string; to: string } {
  const to   = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return {
    from: from.toISOString().split('T')[0],
    to:   to.toISOString().split('T')[0],
  };
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  private handleError(error: HttpErrorResponse | unknown) {
    const apiErrorSource = this.extractApiError(error);
    const message = apiErrorSource?.message
      || (error instanceof HttpErrorResponse
        ? error.error?.message || error.message || 'Erro ao conectar ao servidor'
        : error instanceof Error
        ? error.message
        : 'Erro ao conectar ao servidor');

    const apiError = new Error(message) as Error & ApiErrorShape;
    if (error instanceof HttpErrorResponse) {
      apiError.status = error.status;
    }
    if (apiErrorSource) {
      Object.assign(apiError, apiErrorSource);
    }

    return throwError(() => apiError);
  }

  private extractApiError(error: unknown): ApiErrorShape | null {
    if (!error || typeof error !== 'object') {
      return null;
    }

    const candidate = error as ApiErrorShape;
    if (
      typeof candidate.message === 'string'
      || typeof candidate.step === 'string'
      || typeof candidate.executionId === 'string'
      || typeof candidate.executionStatus === 'string'
      || typeof candidate.hint === 'string'
    ) {
      return candidate;
    }

    return null;
  }

  private request<T>(observable: Observable<T>, shouldRetry = false): Observable<T> {
    const withTimeout = observable.pipe(timeout(HTTP_TIMEOUT));
    const withRetry = shouldRetry
      ? withTimeout.pipe(
          retry({
            count: RETRY_ATTEMPTS,
            delay: (error, retryCount) => {
              if (error?.status && error.status < 500) {
                return throwError(() => error);
              }

              return timer(RETRY_DELAY * retryCount);
            }
          }),
        )
      : withTimeout;

    return withRetry.pipe(catchError(err => this.handleError(err)));
  }

  // Generic GET
  get<T>(endpoint: string, params?: HttpParams): Observable<T> {
    return this.request(this.http.get<T>(`${API}${endpoint}`, { params }), true);
  }

  // Generic POST
  post<T>(endpoint: string, body: any): Observable<T> {
    return this.request(this.http.post<T>(`${API}${endpoint}`, body));
  }

  // Generic PUT
  put<T>(endpoint: string, body: any): Observable<T> {
    return this.request(this.http.put<T>(`${API}${endpoint}`, body));
  }

  // Generic PATCH
  patch<T>(endpoint: string, body: any): Observable<T> {
    return this.request(this.http.patch<T>(`${API}${endpoint}`, body));
  }

  // Generic DELETE
  delete<T>(endpoint: string): Observable<T> {
    return this.request(this.http.delete<T>(`${API}${endpoint}`));
  }

  // ── Campaigns ────────────────────────────────────────────────
  getCampaigns(pagination?: PaginationDto, storeId?: string): Observable<PaginatedResponse<Campaign>> {
    let params = new HttpParams();
    if (pagination?.page) params = params.set('page', pagination.page.toString());
    if (pagination?.limit) params = params.set('limit', pagination.limit.toString());
    if (storeId) params = params.set('storeId', storeId);

    return this.request(this.http.get<PaginatedResponse<Campaign>>(`${API}/campaigns`, { params }));
  }

  getCampaign(id: string): Observable<Campaign> {
    return this.get<Campaign>(`/campaigns/${id}`);
  }

  updateCampaign(id: string, body: UpdateCampaignRequest): Observable<Campaign> {
    return this.patch<Campaign>(`/campaigns/${id}`, body);
  }

  // ── Metrics ──────────────────────────────────────────────────
  getMetricsSummary(days = 30): Observable<AggregatedMetrics> {
    const { from, to } = dateRange(days);
    const params = new HttpParams().set('from', from).set('to', to);
    return this.get<AggregatedMetrics>('/metrics/summary', params);
  }

  getMetricsSummaryForStore(days = 30, storeId?: string): Observable<AggregatedMetrics> {
    const { from, to } = dateRange(days);
    let params = new HttpParams().set('from', from).set('to', to);
    if (storeId) params = params.set('storeId', storeId);
    return this.get<AggregatedMetrics>('/metrics/summary', params);
  }

  getCampaignMetrics(campaignId: string, days = 30): Observable<MetricDaily[]> {
    const { from, to } = dateRange(days);
    const params = new HttpParams().set('from', from).set('to', to);
    return this.get<MetricDaily[]>(`/metrics/campaigns/${campaignId}`, params);
  }

  getCampaignAggregate(campaignId: string, days = 30): Observable<AggregatedMetrics> {
    const { from, to } = dateRange(days);
    const params = new HttpParams().set('from', from).set('to', to);
    return this.get<AggregatedMetrics>(`/metrics/campaigns/${campaignId}/aggregate`, params);
  }

  getMetricsPaginated(pagination?: PaginationDto): Observable<PaginatedResponse<MetricDaily>> {
    let params = new HttpParams();
    if (pagination?.page) params = params.set('page', pagination.page.toString());
    if (pagination?.limit) params = params.set('limit', pagination.limit.toString());

    return this.request(this.http.get<PaginatedResponse<MetricDaily>>(`${API}/metrics`, { params }));
  }

  getCampaignMetricsPaginated(campaignId: string, pagination?: PaginationDto): Observable<PaginatedResponse<MetricDaily>> {
    let params = new HttpParams();
    if (pagination?.page) params = params.set('page', pagination.page.toString());
    if (pagination?.limit) params = params.set('limit', pagination.limit.toString());

    params = params.set('campaignId', campaignId);

    return this.request(this.http.get<PaginatedResponse<MetricDaily>>(`${API}/metrics`, { params }));
  }

  // ── Insights ─────────────────────────────────────────────────
  getInsights(days = 30): Observable<Insight[]> {
    const { from, to } = dateRange(days);
    const params = new HttpParams().set('from', from).set('to', to);
    return this.get<Insight[]>('/insights', params);
  }

  getInsightsForStore(days = 30, storeId?: string): Observable<Insight[]> {
    const { from, to } = dateRange(days);
    let params = new HttpParams().set('from', from).set('to', to);
    if (storeId) params = params.set('storeId', storeId);
    return this.get<Insight[]>('/insights', params);
  }

  getDashboardSummary(days = 30, storeId?: string): Observable<DashboardSummary> {
    let params = new HttpParams().set('days', days.toString());
    if (storeId) params = params.set('storeId', storeId);
    return this.get<DashboardSummary>('/dashboard/summary', params);
  }

  getCampaignInsights(campaignId: string, days = 30): Observable<Insight[]> {
    const { from, to } = dateRange(days);
    const params = new HttpParams()
      .set('from', from)
      .set('to', to)
      .set('campaignId', campaignId);
    return this.get<Insight[]>('/insights', params);
  }

  resolveInsight(id: string): Observable<Insight> {
    return this.patch<Insight>(`/insights/${id}/resolve`, {});
  }

  // ── Meta Accounts ─────────────────────────────────────────────
  getAdAccounts(storeId?: string): Observable<AdAccount[]> {
    const params = storeId ? new HttpParams().set('storeId', storeId) : undefined;
    return this.get<AdAccount[]>('/ad-accounts', params);
  }

  // ── Management ───────────────────────────────────────────────
  getManagers(): Observable<Manager[]> {
    return this.get<Manager[]>('/managers');
  }

  createManager(body: CreateManagerRequest): Observable<Manager> {
    return this.post<Manager>('/managers', body);
  }

  updateManager(id: string, body: UpdateManagerRequest): Observable<Manager> {
    return this.patch<Manager>(`/managers/${id}`, body);
  }

  toggleManagerActive(id: string): Observable<Manager> {
    return this.patch<Manager>(`/managers/${id}/toggle-active`, {});
  }

  deleteManager(id: string): Observable<{ message: string }> {
    return this.delete<{ message: string }>(`/managers/${id}`);
  }

  getStores(): Observable<Store[]> {
    return this.get<Store[]>('/stores');
  }

  getAccessibleStores(): Observable<Store[]> {
    return this.get<Store[]>('/stores/accessible');
  }

  createStore(body: CreateStoreRequest): Observable<Store> {
    return this.post<Store>('/stores', body);
  }

  updateStore(id: string, body: UpdateStoreRequest): Observable<Store> {
    return this.patch<Store>(`/stores/${id}`, body);
  }

  toggleStoreActive(id: string): Observable<Store> {
    return this.patch<Store>(`/stores/${id}/toggle-active`, {});
  }

  deleteStore(id: string): Observable<{ message: string }> {
    return this.delete<{ message: string }>(`/stores/${id}`);
  }

  getUsers(): Observable<User[]> {
    return this.get<User[]>('/users');
  }

  getMyCompany(): Observable<CompanyProfilePayload> {
    return this.get<CompanyProfilePayload>('/me/company');
  }

  updateMyCompany(body: CompanyProfilePayload): Observable<CompanyProfilePayload> {
    return this.patch<CompanyProfilePayload>('/me/company', body);
  }

  createUser(body: CreateUserRequest): Observable<User> {
    return this.post<User>('/users', body);
  }

  resetUserPassword(id: string, body: ResetUserPasswordRequest): Observable<User> {
    return this.patch<User>(`/users/${id}/password`, body);
  }

  deleteUser(id: string): Observable<{ message: string }> {
    return this.delete<{ message: string }>(`/users/${id}`);
  }

  getStoreUsers(storeId: string): Observable<User[]> {
    return this.get<User[]>(`/stores/${storeId}/users`);
  }

  linkUserToStore(storeId: string, userId: string): Observable<UserStore> {
    return this.post<UserStore>(`/stores/${storeId}/users/${userId}`, {});
  }

  unlinkUserFromStore(storeId: string, userId: string): Observable<{ message: string }> {
    return this.delete<{ message: string }>(`/stores/${storeId}/users/${userId}`);
  }

  getMetaIntegrationStatus(storeId: string): Observable<StoreIntegration> {
    return this.get<StoreIntegration>(`/integrations/meta/stores/${storeId}/status`);
  }

  startMetaOAuth(storeId: string): Observable<MetaOAuthStartResponse> {
    return this.get<MetaOAuthStartResponse>(`/integrations/meta/stores/${storeId}/oauth/start`);
  }

  connectMetaIntegration(storeId: string, body: ConnectMetaIntegrationRequest): Observable<StoreIntegration> {
    return this.post<StoreIntegration>(`/integrations/meta/stores/${storeId}/connect`, body);
  }

  updateMetaIntegrationStatus(
    storeId: string,
    body: UpdateMetaIntegrationStatusRequest,
  ): Observable<StoreIntegration> {
    return this.patch<StoreIntegration>(`/integrations/meta/stores/${storeId}/status`, body);
  }

  disconnectMetaIntegration(storeId: string): Observable<StoreIntegration> {
    return this.delete<StoreIntegration>(`/integrations/meta/stores/${storeId}`);
  }

  getMetaAdAccounts(storeId: string): Observable<MetaAdAccount[]> {
    return this.get<MetaAdAccount[]>(`/integrations/meta/stores/${storeId}/ad-accounts`);
  }

  getMetaPages(storeId: string): Observable<MetaPage[]> {
    return this.get<MetaPage[]>(`/integrations/meta/stores/${storeId}/pages`);
  }

  getAssets(storeId: string, type: AssetType = 'image'): Observable<Asset[]> {
    let params = new HttpParams().set('storeId', storeId);
    if (type) {
      params = params.set('type', type);
    }
    return this.get<Asset[]>('/assets', params);
  }

  uploadAsset(file: File, storeId: string): Observable<HttpEvent<Asset>> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('storeId', storeId);

    return this.http.post<Asset>(`${API}/assets/upload?storeId=${encodeURIComponent(storeId)}`, formData, {
      observe: 'events',
      reportProgress: true,
    }).pipe(catchError((err) => this.handleError(err)));
  }

  updateMetaPage(storeId: string, body: UpdateMetaPageRequest): Observable<StoreIntegration> {
    return this.patch<StoreIntegration>(`/integrations/meta/stores/${storeId}/page`, body);
  }

  syncMetaAdAccounts(storeId: string): Observable<MetaAdAccount[]> {
    return this.post<MetaAdAccount[]>(`/integrations/meta/stores/${storeId}/ad-accounts/sync`, {});
  }

  createMetaCampaign(storeId: string, body: CreateMetaCampaignRequest): Observable<CreateMetaCampaignResponse> {
    return this.request(
      this.http.post<CreateMetaCampaignResponse>(`${API}/integrations/meta/stores/${storeId}/campaigns`, body),
    );
  }

  getMetaCampaignRecoveryStatus(storeId: string, executionId: string): Observable<MetaCampaignRecoveryStatusResponse> {
    return this.get<MetaCampaignRecoveryStatusResponse>(
      `/integrations/meta/stores/${storeId}/campaigns/recovery/${executionId}`,
    );
  }

  retryMetaCampaignRecovery(
    storeId: string,
    executionId: string,
    body: Partial<CreateMetaCampaignRequest>,
  ): Observable<MetaCampaignRecoveryResponse> {
    return this.request(
      this.http.post<MetaCampaignRecoveryResponse>(
        `${API}/integrations/meta/stores/${storeId}/campaigns/recovery/${executionId}/retry`,
        body,
      ),
    );
  }

  getIbgeStates(): Observable<IbgeState[]> {
    return this.get<IbgeState[]>('/ibge/states');
  }

  getIbgeCities(uf: string): Observable<IbgeCity[]> {
    return this.get<IbgeCity[]>(`/ibge/states/${encodeURIComponent((uf || '').trim().toUpperCase())}/cities`);
  }
}
