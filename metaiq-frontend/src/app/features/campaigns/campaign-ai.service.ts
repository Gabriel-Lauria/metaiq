import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CampaignSuggestionResponse } from '../../core/models';
import { environment } from '../../core/environment';

const API = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class CampaignAiService {
  private http = inject(HttpClient);

  suggest(prompt: string, storeId: string): Observable<CampaignSuggestionResponse> {
    return this.http.post<CampaignSuggestionResponse>(`${API}/ai/campaign-suggestions`, { prompt, storeId });
  }
}
