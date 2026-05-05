import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

/**
 * COMPONENTE DE BRIEFING PARA IA
 * 
 * Permite ao usuário descrever sua campanha em linguagem natural.
 * A descrição é enviada para o backend que usa IA para estruturar a campanha.
 * 
 * Inclui:
 * - Textarea grande para o briefing
 * - Exemplos de briefings
 * - Botão para gerar campanha
 * - Validação básica
 */
@Component({
  selector: 'app-campaign-ai-briefing',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="briefing-container">
      <div class="briefing-header">
        <h2>Descreva sua campanha</h2>
        <p class="subtitle">
          Digite um briefing em linguagem natural. A IA vai estruturar a campanha para você. A publicação automática atual é apenas para campanhas de website.
        </p>
      </div>

      <form class="briefing-form" (ngSubmit)="onSubmit()">
        <div class="form-group">
          <label for="briefing-input">Seu briefing</label>
          <textarea
            id="briefing-input"
            class="briefing-textarea"
            [(ngModel)]="briefingText"
            name="briefing"
            placeholder="Ex: Quero vender mais cursos online para profissionais de TI. Tenho orçamento de R$ 100/dia. Preciso de leads qualificados. Posso direcionar para WhatsApp ou landing page..."
            rows="8"
            [attr.aria-label]="'Descrever campanha para IA processar'"
            [attr.aria-describedby]="'briefing-help'"
          ></textarea>
          <div class="input-hint" id="briefing-help">
            Quanto mais detalhes você fornecer, melhor será a campanha gerada.
          </div>
        </div>

        <div class="examples-section">
          <h3>Exemplos de briefing</h3>
          <div class="examples-list">
            <button
              type="button"
              *ngFor="let example of examples"
              class="example-btn"
              (click)="useBriefingExample(example)"
              [attr.aria-label]="'Usar exemplo: ' + example.substr(0, 50)..."
            >
              <span class="example-icon">💡</span>
              <span class="example-text">{{ example.substr(0, 80) }}...</span>
            </button>
          </div>
        </div>

        <div class="form-actions">
          <button
            type="button"
            class="btn btn-secondary"
            (click)="onCancel()"
            [disabled]="isGenerating()"
          >
            Voltar
          </button>
          <button
            type="submit"
            class="btn btn-primary"
            [disabled]="!briefingText.trim() || isGenerating()"
            [attr.aria-busy]="isGenerating()"
          >
            <span *ngIf="!isGenerating()">
              {{ generatingText() }}
            </span>
            <span *ngIf="isGenerating()" class="loading-state">
              <span class="spinner"></span>
              Gerando campanha...
            </span>
          </button>
        </div>

        <div class="error-message" *ngIf="error()" role="alert">
          <span class="error-icon">⚠️</span>
          {{ error() }}
        </div>
      </form>

      <div class="tips-section">
        <h3>💡 Dicas para melhor resultado</h3>
        <ul>
          <li>Descreva seu produto/serviço</li>
          <li>Informe seu orçamento e duração</li>
          <li>Especifique o público-alvo</li>
          <li>Mencione o destino. Website tem publicação automática; mensagens entram como sugestão estratégica.</li>
          <li>Indique o objetivo principal (vendas, leads, tráfego)</li>
        </ul>
      </div>
    </div>
  `,
  styles: [`
    .briefing-container {
      display: flex;
      flex-direction: column;
      gap: 2rem;
      max-width: 700px;
      margin: 0 auto;
      padding: 2rem 1rem;
    }

    .briefing-header {
      text-align: center;
      margin-bottom: 1rem;
    }

    .briefing-header h2 {
      font-size: 1.75rem;
      font-weight: 700;
      color: #1e293b;
      margin: 0 0 0.5rem 0;
    }

    .subtitle {
      font-size: 1rem;
      color: #64748b;
      margin: 0;
    }

    .briefing-form {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .form-group label {
      font-weight: 600;
      color: #1e293b;
      font-size: 1rem;
    }

    .briefing-textarea {
      padding: 1rem;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      font-family: inherit;
      font-size: 1rem;
      color: #1e293b;
      resize: vertical;
      transition: border-color 0.2s ease;

      &:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }

      &::placeholder {
        color: #94a3b8;
      }
    }

    .input-hint {
      font-size: 0.875rem;
      color: #64748b;
    }

    .examples-section {
      padding: 1rem;
      background: #f8fafc;
      border-radius: 8px;
    }

    .examples-section h3 {
      font-size: 0.95rem;
      font-weight: 600;
      color: #1e293b;
      margin: 0 0 1rem 0;
    }

    .examples-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .example-btn {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
      background: white;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      cursor: pointer;
      text-align: left;
      transition: all 0.2s ease;

      &:hover {
        border-color: #3b82f6;
        background: #f0f7ff;
      }

      &:active {
        transform: scale(0.98);
      }
    }

    .example-icon {
      flex-shrink: 0;
      font-size: 1.25rem;
    }

    .example-text {
      font-size: 0.875rem;
      color: #475569;
      line-height: 1.4;
      word-break: break-word;
    }

    .form-actions {
      display: flex;
      gap: 1rem;
      justify-content: flex-end;
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
    }

    .btn-primary {
      background: linear-gradient(135deg, #3b82f6, #2563eb);
      color: white;
      display: flex;
      align-items: center;
      gap: 0.5rem;

      &:hover:not(:disabled) {
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
        transform: translateY(-1px);
      }
    }

    .btn-secondary {
      background: #e2e8f0;
      color: #1e293b;

      &:hover:not(:disabled) {
        background: #cbd5e1;
      }
    }

    .loading-state {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top-color: white;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    .error-message {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem;
      background: #fee2e2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      color: #991b1b;
      font-size: 0.95rem;
    }

    .error-icon {
      flex-shrink: 0;
      font-size: 1.25rem;
    }

    .tips-section {
      padding: 1.5rem;
      background: #f0fdf4;
      border-radius: 8px;
      border-left: 4px solid #22c55e;
    }

    .tips-section h3 {
      font-size: 1rem;
      font-weight: 600;
      color: #1e7e34;
      margin: 0 0 0.75rem 0;
    }

    .tips-section ul {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .tips-section li {
      color: #166534;
      font-size: 0.9rem;
      padding-left: 1.5rem;
      position: relative;

      &:before {
        content: "✓";
        position: absolute;
        left: 0;
        font-weight: 700;
      }
    }

    @media (max-width: 640px) {
      .briefing-container {
        padding: 1rem;
        gap: 1rem;
      }

      .briefing-header h2 {
        font-size: 1.5rem;
      }

      .form-actions {
        flex-direction: column;
      }

      .btn {
        width: 100%;
      }
    }
  `]
})
export class CampaignAiBriefingComponent {
  @Input() set initialBriefing(value: string) {
    this.briefingText = value || '';
  }
  @Output() generate = new EventEmitter<string>();
  @Output() cancel = new EventEmitter<void>();

  readonly isGenerating = signal(false);
  readonly error = signal<string | null>(null);
  briefingText = '';

  readonly examples = [
    'Campanha de leads para ecommerce de moda no Brasil com orçamento 120 por dia, CTA falar no WhatsApp e foco em remarketing.',
    'Campanha de tráfego para landing page de consultoria, público 25 a 45 anos, headline direta e imagem clean.',
    'Campanha de alcance para lançamento local, orçamento 80 por dia, criativo forte para stories e reels.',
    'Vender cursos online para profissionais de TI. Leads qualificados, orçamento R$ 100/dia, direcionar para WhatsApp.',
    'Aumentar seguidores do Instagram. Público jovem 18-30 anos. Orçamento R$ 50/dia. Foco em stories e reels.',
  ];

  readonly generatingText = signal('Gerar campanha com IA');

  useBriefingExample(example: string): void {
    this.briefingText = example;
  }

  onSubmit(): void {
    const brief = this.briefingText.trim();
    if (!brief) {
      this.error.set('Por favor, escreva um briefing antes de continuar.');
      return;
    }

    this.error.set(null);
    this.isGenerating.set(true);
    this.generatingText.set('Gerando...');
    this.generate.emit(brief);
  }

  onCancel(): void {
    this.cancel.emit();
  }
}
