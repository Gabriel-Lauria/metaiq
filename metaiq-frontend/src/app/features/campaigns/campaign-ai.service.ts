import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CampaignAnalysisResponse,
  CampaignCopilotAnalysisRequest,
  CampaignSuggestionRequest,
  CampaignSuggestionResponse,
} from '../../core/models';
import { environment } from '../../core/environment';

const API = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class CampaignAiService {
  private http = inject(HttpClient);

  suggest(request: CampaignSuggestionRequest): Observable<CampaignSuggestionResponse> {
    return this.http.post<CampaignSuggestionResponse>(`${API}/ai/campaign-suggestions`, request);
  }

  analyze(request: CampaignCopilotAnalysisRequest): Observable<CampaignAnalysisResponse> {
    return this.http.post<CampaignAnalysisResponse>(`${API}/ai/campaign-analysis`, request);
  }
}
