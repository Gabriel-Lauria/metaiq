import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
import {
  Campaign, MetricDaily, AggregatedMetrics,
  CampaignInsightReport, AdAccount,
} from '../models';
import { environment } from './environment';

const API = environment.apiUrl;
const HTTP_TIMEOUT = 15000; // 15s

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
      catchError(err => this.handleError(err)),
    );
  }

  // ── Campaigns ────────────────────────────────────────────────
  getCampaigns(page = 1, limit = 10): Observable<any> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());
    return this.request(this.http.get(`${API}/campaigns`, { params }));
  }

  getCampaign(id: string): Observable<Campaign> {
    return this.request(this.http.get<Campaign>(`${API}/campaigns/${id}`));
  }

  // ── Metrics ──────────────────────────────────────────────────
  getMetricsSummary(days = 30): Observable<AggregatedMetrics> {
    const { from, to } = dateRange(days);
    const params = new HttpParams().set('from', from).set('to', to);
    return this.request(this.http.get<AggregatedMetrics>(`${API}/metrics/summary`, { params }));
  }

  getMetrics(page = 1, limit = 10, campaignId?: string): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());
    if (campaignId) {
      params = params.set('campaignId', campaignId);
    }
    return this.request(this.http.get(`${API}/metrics`, { params }));
  }

  getCampaignMetrics(campaignId: string, days = 30): Observable<MetricDaily[]> {
    const { from, to } = dateRange(days);
    const params = new HttpParams().set('from', from).set('to', to);
    return this.request(this.http.get<MetricDaily[]>(`${API}/metrics/campaigns/${campaignId}`, { params }));
  }

  getCampaignAggregate(campaignId: string, days = 30): Observable<AggregatedMetrics> {
    const { from, to } = dateRange(days);
    const params = new HttpParams().set('from', from).set('to', to);
    return this.request(this.http.get<AggregatedMetrics>(`${API}/metrics/campaigns/${campaignId}/aggregate`, { params }));
  }

  // ── Insights ─────────────────────────────────────────────────
  getInsights(days = 30): Observable<CampaignInsightReport[]> {
    const { from, to } = dateRange(days);
    const params = new HttpParams().set('from', from).set('to', to);
    return this.request(this.http.get<CampaignInsightReport[]>(`${API}/insights`, { params }));
  }

  getCampaignInsights(campaignId: string, days = 30): Observable<any[]> {
    const { from, to } = dateRange(days);
    const params = new HttpParams().set('from', from).set('to', to);
    return this.request(this.http.get<any[]>(`${API}/insights/campaigns/${campaignId}`, { params }));
  }

  // ── Meta Accounts ─────────────────────────────────────────────
  getAdAccounts(): Observable<AdAccount[]> {
    return this.request(this.http.get<AdAccount[]>(`${API}/meta/accounts`));
  }

  getMetaConnectUrl(): string {
    return `${API}/meta/connect`;
  }
}
