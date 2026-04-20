import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CampaignAiSuggestResponse } from '../../core/models';
import { environment } from '../../core/environment';

const API = environment.apiUrl;

@Injectable({ providedIn: 'root' })
export class CampaignAiService {
  private http = inject(HttpClient);

  suggest(prompt: string): Observable<CampaignAiSuggestResponse> {
    return this.http.post<CampaignAiSuggestResponse>(`${API}/campaign-ai/suggest`, { prompt });
  }
}
