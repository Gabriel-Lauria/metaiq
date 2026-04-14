import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { timeout, retry, catchError } from 'rxjs/operators';
import {
  Campaign, MetricDaily, AggregatedMetrics,
  CampaignInsightReport, AdAccount,
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
    const message = error?.error?.message ?? 'Erro ao conectar ao servidor';
    console.error('API Error:', message, error);
    return throwError(() => new Error(message));
  }

  private request<T>(observable: Observable<T>): Observable<T> {
    return observable.pipe(
      timeout(HTTP_TIMEOUT),
      retry({ count: RETRY_ATTEMPTS, delay: RETRY_DELAY }),
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
  getCampaigns(pagination?: PaginationDto): Observable<PaginatedResponse<Campaign>> {
    let params = new HttpParams();
    if (pagination?.page) params = params.set('page', pagination.page.toString());
    if (pagination?.limit) params = params.set('limit', pagination.limit.toString());

    return this.request(this.http.get<PaginatedResponse<Campaign>>(`${API}/campaigns`, { params }));
  }

  getCampaign(id: string): Observable<Campaign> {
    return this.get<Campaign>(`/api/campaigns/${id}`);
  }

  // ── Metrics ──────────────────────────────────────────────────
  getMetricsSummary(days = 30): Observable<AggregatedMetrics> {
    const { from, to } = dateRange(days);
    const params = new HttpParams().set('from', from).set('to', to);
    return this.get<AggregatedMetrics>('/api/metrics/summary', params);
  }

  getCampaignMetrics(campaignId: string, days = 30): Observable<MetricDaily[]> {
    const { from, to } = dateRange(days);
    const params = new HttpParams().set('from', from).set('to', to);
    return this.get<MetricDaily[]>(`/api/metrics/campaigns/${campaignId}`, params);
  }

  getCampaignAggregate(campaignId: string, days = 30): Observable<AggregatedMetrics> {
    const { from, to } = dateRange(days);
    const params = new HttpParams().set('from', from).set('to', to);
    return this.get<AggregatedMetrics>(`/api/metrics/campaigns/${campaignId}/aggregate`, params);
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

    return this.request(this.http.get<PaginatedResponse<MetricDaily>>(`${API}/metrics/campaigns/${campaignId}`, { params }));
  }

  // ── Insights ─────────────────────────────────────────────────
  getInsights(days = 30): Observable<CampaignInsightReport[]> {
    const { from, to } = dateRange(days);
    const params = new HttpParams().set('from', from).set('to', to);
    return this.get<CampaignInsightReport[]>('/api/insights', params);
  }

  getCampaignInsights(campaignId: string, days = 30): Observable<any[]> {
    const { from, to } = dateRange(days);
    const params = new HttpParams().set('from', from).set('to', to);
    return this.get<any[]>(`/api/insights/campaigns/${campaignId}`, params);
  }

  // ── Meta Accounts ─────────────────────────────────────────────
  getAdAccounts(): Observable<AdAccount[]> {
    return this.get<AdAccount[]>('/api/meta/accounts');
  }

  getMetaConnectUrl(): string {
    return `${API}/meta/connect`;
  }
}
