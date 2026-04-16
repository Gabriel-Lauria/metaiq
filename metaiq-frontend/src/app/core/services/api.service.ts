import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
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
  ConnectMetaIntegrationRequest,
  UpdateMetaIntegrationStatusRequest,
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

  private handleError(error: any) {
    const message = error?.message || error?.error?.message || 'Erro ao conectar ao servidor';
    return throwError(() => new Error(message));
  }

  private request<T>(observable: Observable<T>): Observable<T> {
    return observable.pipe(
      timeout(HTTP_TIMEOUT),
      retry({
        count: RETRY_ATTEMPTS,
        delay: (error, retryCount) => {
          if (error?.status && error.status < 500) {
            return throwError(() => error);
          }

          return timer(RETRY_DELAY * retryCount);
        }
      }),
      catchError(err => this.handleError(err)),
    );
  }

  // Generic GET
  get<T>(endpoint: string, params?: HttpParams): Observable<T> {
    return this.request(this.http.get<T>(`${API}${endpoint}`, { params }));
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

  // ── Meta Accounts ─────────────────────────────────────────────
  getAdAccounts(): Observable<AdAccount[]> {
    return this.get<AdAccount[]>('/ad-accounts');
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

  getUsers(): Observable<User[]> {
    return this.get<User[]>('/users');
  }

  createUser(body: CreateUserRequest): Observable<User> {
    return this.post<User>('/users', body);
  }

  resetUserPassword(id: string, body: ResetUserPasswordRequest): Observable<User> {
    return this.patch<User>(`/users/${id}/password`, body);
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

  syncMetaAdAccounts(storeId: string): Observable<MetaAdAccount[]> {
    return this.post<MetaAdAccount[]>(`/integrations/meta/stores/${storeId}/ad-accounts/sync`, {});
  }
}
