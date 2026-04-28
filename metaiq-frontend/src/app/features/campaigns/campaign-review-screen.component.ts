import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CampaignBuilderState } from './campaign-builder.types';

interface ReviewSection {
  id: string;
  title: string;
  icon: string;
  items: ReviewItem[];
}

interface ReviewItem {
  label: string;
  value: string;
  icon?: string;
  tone?: 'info' | 'success' | 'warning' | 'danger';
}

/**
 * TELA DE REVISÃO
 * 
 * Mostra os resultados da IA e permite que o usuário:
 * - Revise os dados gerados
 * - Edite campos principais
 * - Veja score de qualidade
 * - Identifique riscos
 * - Regenere a campanha
 * - Publique se satisfeito
 * 
 * Mantém o estado interno sincronizado com as edições do usuário
 */
@Component({
  selector: 'app-campaign-review-screen',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="review-container">
      <header class="review-header">
        <h2>Revisão da Campanha</h2>
        <p class="subtitle">Verifique os detalhes antes de publicar</p>
      </header>

      <!-- Quality Score -->
      <div class="quality-card" *ngIf="qualityScore() !== null">
        <div class="score-display">
          <div class="score-circle" [class]="'score-' + getScoreColor()">
            {{ qualityScore() }}%
          </div>
          <div class="score-info">
            <h3>{{ getScoreLabel() }}</h3>
            <p>{{ getScoreDescription() }}</p>
          </div>
        </div>
      </div>

      <!-- Campaign Preview -->
      <section class="preview-section">
        <h3>📸 Preview do Anúncio</h3>
        <div class="creative-preview">
          <div class="preview-image" *ngIf="campaignData?.creative.imageUrl">
            <img [src]="campaignData.creative.imageUrl" alt="Preview da criação" />
          </div>
          <div class="preview-content">
            <h4>{{ campaignData?.creative.headline || 'Seu título aqui' }}</h4>
            <p>{{ campaignData?.creative.message || 'Sua mensagem aqui' }}</p>
            <button class="cta-button">{{ campaignData?.creative.cta || 'Saber mais' }}</button>
          </div>
        </div>
      </section>

      <!-- Key Info -->
      <section class="info-section">
        <h3>📊 Informações Principais</h3>
        <div class="info-grid">
          <div class="info-item">
            <label>Nome da Campanha</label>
            <p>{{ campaignData?.campaign.name }}</p>
          </div>
          <div class="info-item">
            <label>Objetivo</label>
            <p>{{ campaignData?.campaign.objective }}</p>
          </div>
          <div class="info-item">
            <label>Orçamento Diário</label>
            <p>R$ {{ (campaignData?.budget.value || 0).toFixed(2) }}</p>
          </div>
          <div class="info-item">
            <label>Público-alvo</label>
            <p>{{ campaignData?.audience.ageMin }}-{{ campaignData?.audience.ageMax }} anos</p>
          </div>
        </div>
      </section>

      <!-- Risks & Issues -->
      <section class="alerts-section" *ngIf="risks().length > 0">
        <h3>⚠️ Avisos e Riscos</h3>
        <div class="alerts-list">
          <div class="alert alert-danger" *ngFor="let risk of risks()">
            <span class="alert-icon">🚨</span>
            <div class="alert-content">
              <strong>{{ risk.title }}</strong>
              <p>{{ risk.description }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Improvements & Suggestions -->
      <section class="improvements-section" *ngIf="improvements().length > 0">
        <h3>💡 Sugestões de Melhoria</h3>
        <div class="improvements-list">
          <div class="improvement" *ngFor="let improvement of improvements()">
            <span class="improvement-icon">✨</span>
            <div class="improvement-content">
              <strong>{{ improvement.title }}</strong>
              <p>{{ improvement.description }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- AI Explanation -->
      <section class="explanation-section" *ngIf="aiExplanation()">
        <h3>🤖 Explicação da IA</h3>
        <div class="explanation-box">
          {{ aiExplanation() }}
        </div>
      </section>

      <!-- Actions -->
      <div class="review-actions">
        <button
          type="button"
          class="btn btn-secondary"
          (click)="onEditManually()"
        >
          Editar Manualmente
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          (click)="onRegenerate()"
          [disabled]="isGenerating()"
        >
          {{ isGenerating() ? '⏳ Gerando...' : 'Gerar Novamente' }}
        </button>
        <button
          type="button"
          class="btn btn-primary"
          (click)="onPublish()"
          [disabled]="risks().length > 0 || isSubmitting()"
        >
          {{ isSubmitting() ? '⏳ Publicando...' : '✓ Publicar Campanha' }}
        </button>
      </div>

      <!-- Notes -->
      <div class="review-notes" *ngIf="!canPublish()">
        <p class="note-warning">
          ⚠️ Há pontos que precisam de atenção antes de publicar. Revise os avisos acima.
        </p>
      </div>
    </div>
  `,
  styles: [`
    .review-container {
      display: flex;
      flex-direction: column;
      gap: 2rem;
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem 1rem;
    }

    .review-header {
      text-align: center;
    }

    .review-header h2 {
      font-size: 2rem;
      font-weight: 700;
      color: #1e293b;
      margin: 0 0 0.5rem 0;
    }

    .subtitle {
      font-size: 1rem;
      color: #64748b;
      margin: 0;
    }

    .quality-card {
      padding: 1.5rem;
      background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
      border: 2px solid #0ea5e9;
      border-radius: 12px;
    }

    .score-display {
      display: flex;
      align-items: center;
      gap: 2rem;
    }

    .score-circle {
      width: 100px;
      height: 100px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
      font-weight: 700;
      color: white;

      &.score-good {
        background: linear-gradient(135deg, #10b981, #059669);
      }

      &.score-fair {
        background: linear-gradient(135deg, #f59e0b, #d97706);
      }

      &.score-poor {
        background: linear-gradient(135deg, #ef4444, #dc2626);
      }
    }

    .score-info h3 {
      font-size: 1.25rem;
      font-weight: 600;
      color: #1e293b;
      margin: 0 0 0.25rem 0;
    }

    .score-info p {
      color: #64748b;
      margin: 0;
      font-size: 0.95rem;
    }

    section {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 1.5rem;
      background: white;
    }

    section h3 {
      font-size: 1.1rem;
      font-weight: 600;
      color: #1e293b;
      margin: 0 0 1rem 0;
    }

    .preview-section {
      background: #f8fafc;
    }

    .creative-preview {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
      align-items: center;
    }

    .preview-image {
      border-radius: 8px;
      overflow: hidden;
      background: #e2e8f0;
      aspect-ratio: 1 / 1;
      display: flex;
      align-items: center;
      justify-content: center;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }

    .preview-content {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .preview-content h4 {
      font-size: 1.25rem;
      font-weight: 600;
      color: #1e293b;
      margin: 0;
    }

    .preview-content p {
      font-size: 0.95rem;
      color: #475569;
      margin: 0;
      line-height: 1.6;
    }

    .cta-button {
      align-self: flex-start;
      padding: 0.75rem 1.5rem;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        background: #2563eb;
      }
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1.5rem;
    }

    .info-item {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .info-item label {
      font-weight: 600;
      color: #64748b;
      font-size: 0.875rem;
    }

    .info-item p {
      font-size: 1rem;
      color: #1e293b;
      margin: 0;
      font-weight: 500;
    }

    .alerts-list,
    .improvements-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .alert {
      display: flex;
      gap: 1rem;
      padding: 1rem;
      border-radius: 8px;
      border-left: 4px solid;

      &.alert-danger {
        background: #fee2e2;
        border-color: #ef4444;
        color: #991b1b;
      }
    }

    .alert-icon,
    .improvement-icon {
      flex-shrink: 0;
      font-size: 1.5rem;
    }

    .alert-content,
    .improvement-content {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .alert-content strong,
    .improvement-content strong {
      font-size: 0.95rem;
      color: inherit;
    }

    .alert-content p,
    .improvement-content p {
      font-size: 0.875rem;
      margin: 0;
      color: inherit;
      opacity: 0.9;
    }

    .improvement {
      display: flex;
      gap: 1rem;
      padding: 1rem;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 8px;
      color: #166534;
    }

    .improvements-section {
      background: #f8fafc;
    }

    .explanation-box {
      padding: 1rem;
      background: white;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      line-height: 1.6;
      color: #475569;
      font-size: 0.95rem;
    }

    .review-actions {
      display: flex;
      gap: 1rem;
      justify-content: flex-end;
      padding: 1rem 0;
    }

    .btn {
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      font-weight: 600;
      border: none;
      cursor: pointer;
      transition: all 0.2s ease;
      font-size: 1rem;

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      &:hover:not(:disabled) {
        transform: translateY(-1px);
      }
    }

    .btn-primary {
      background: linear-gradient(135deg, #10b981, #059669);
      color: white;

      &:hover:not(:disabled) {
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
      }
    }

    .btn-secondary {
      background: #e2e8f0;
      color: #1e293b;

      &:hover:not(:disabled) {
        background: #cbd5e1;
      }
    }

    .review-notes {
      text-align: center;
      padding: 1rem;
      background: #fef3c7;
      border: 1px solid #fcd34d;
      border-radius: 8px;
    }

    .note-warning {
      color: #92400e;
      margin: 0;
      font-size: 0.95rem;
    }

    @media (max-width: 768px) {
      .review-container {
        padding: 1rem;
      }

      .score-display {
        flex-direction: column;
        text-align: center;
        gap: 1rem;
      }

      .creative-preview {
        grid-template-columns: 1fr;
      }

      .review-actions {
        flex-direction: column;
      }

      .btn {
        width: 100%;
      }
    }
  `]
})
export class CampaignReviewScreenComponent {
  @Input() campaignData: CampaignBuilderState | null = null;
  @Input() qualityScore: () => number | null = () => null;
  @Input() risks: () => Array<{ title: string; description: string }> = () => [];
  @Input() improvements: () => Array<{ title: string; description: string }> = () => [];
  @Input() aiExplanation: () => string = () => '';
  @Input() isGenerating = signal(false);
  @Input() isSubmitting = signal(false);

  @Output() editManually = new EventEmitter<void>();
  @Output() regenerate = new EventEmitter<void>();
  @Output() publish = new EventEmitter<void>();

  canPublish(): boolean {
    return this.risks().length === 0;
  }

  getScoreColor(): string {
    const score = this.qualityScore();
    if (!score) return 'fair';
    if (score >= 80) return 'good';
    if (score >= 60) return 'fair';
    return 'poor';
  }

  getScoreLabel(): string {
    const score = this.qualityScore();
    if (!score) return 'Score indisponível';
    if (score >= 80) return 'Excelente!';
    if (score >= 60) return 'Bom';
    return 'Precisa de ajustes';
  }

  getScoreDescription(): string {
    const score = this.qualityScore();
    if (!score) return 'Não foi possível calcular o score';
    if (score >= 80) return 'Sua campanha está pronta para publicar';
    if (score >= 60) return 'Considere revisar alguns pontos antes de publicar';
    return 'Há vários pontos que precisam melhorar';
  }

  onEditManually(): void {
    this.editManually.emit();
  }

  onRegenerate(): void {
    this.regenerate.emit();
  }

  onPublish(): void {
    if (this.canPublish()) {
      this.publish.emit();
    }
  }
}
