import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output } from '@angular/core';
import { CampaignModeSelection } from './campaign-builder.types';

interface ModeOption {
  mode: CampaignModeSelection;
  icon: string;
  title: string;
  description: string;
  isPrimary: boolean;
}

/**
 * TELA INICIAL DE SELEÇÃO DE MODO
 * 
 * Apresenta três opções de criação de campanha:
 * 1. Criar com IA (principal) - novo modo
 * 2. Criação orientada (wizard existente) - usa fluxo guiado
 * 3. Criação avançada (formulário completo) - acesso a todos os campos
 * 
 * Todos usam o mesmo estado interno (campaignBuilderState)
 */
@Component({
  selector: 'app-campaign-mode-selector',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="mode-selector-container">
      <header class="selector-header">
        <h1>Como você quer criar sua campanha?</h1>
        <p class="subtitle">Escolha o melhor caminho para seu objetivo</p>
      </header>

      <div class="modes-grid">
        <button
          *ngFor="let mode of modes"
          type="button"
          class="mode-card"
          [class.primary]="mode.isPrimary"
          (click)="selectMode(mode.mode)"
          [attr.aria-pressed]="false"
        >
          <div class="mode-icon">{{ mode.icon }}</div>
          <h2 class="mode-title">{{ mode.title }}</h2>
          <p class="mode-description">{{ mode.description }}</p>
          <span *ngIf="mode.isPrimary" class="badge-primary">Recomendado</span>
        </button>
      </div>

      <footer class="selector-footer">
        <p class="help-text">
          Você pode mudar de modo a qualquer momento sem perder suas informações.
        </p>
      </footer>
    </div>
  `,
  styles: [`
    .mode-selector-container {
      display: flex;
      flex-direction: column;
      gap: 2rem;
      padding: 3rem 2rem;
      max-width: 1000px;
      margin: 0 auto;
    }

    .selector-header {
      text-align: center;
      gap: 0.5rem;
    }

    .selector-header h1 {
      font-size: 2rem;
      font-weight: 700;
      color: #1e293b;
      margin: 0 0 0.5rem 0;
    }

    .subtitle {
      font-size: 1.125rem;
      color: #64748b;
      margin: 0;
    }

    .modes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.5rem;
    }

    .mode-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2rem;
      border: 2px solid #e2e8f0;
      border-radius: 12px;
      background: white;
      cursor: pointer;
      transition: all 0.3s ease;
      text-align: center;
      gap: 1rem;
      min-height: 300px;

      &:hover {
        border-color: #cbd5e1;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        transform: translateY(-2px);
      }

      &.primary {
        border-color: #3b82f6;
        background: linear-gradient(135deg, #f0f7ff 0%, #e0f2fe 100%);
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);

        &:hover {
          border-color: #2563eb;
          box-shadow: 0 8px 24px rgba(59, 130, 246, 0.3);
          transform: translateY(-4px);
        }
      }
    }

    .mode-icon {
      font-size: 3rem;
      line-height: 1;
    }

    .mode-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: #1e293b;
      margin: 0;
    }

    .mode-description {
      font-size: 0.95rem;
      color: #64748b;
      margin: 0;
      flex: 1;
      line-height: 1.5;
    }

    .badge-primary {
      display: inline-block;
      padding: 0.375rem 0.75rem;
      background: #3b82f6;
      color: white;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .selector-footer {
      text-align: center;
      padding: 1rem 0;
    }

    .help-text {
      font-size: 0.875rem;
      color: #94a3b8;
      margin: 0;
    }

    @media (max-width: 768px) {
      .mode-selector-container {
        padding: 2rem 1rem;
        gap: 1.5rem;
      }

      .modes-grid {
        grid-template-columns: 1fr;
      }

      .selector-header h1 {
        font-size: 1.5rem;
      }

      .subtitle {
        font-size: 1rem;
      }

      .mode-card {
        padding: 1.5rem;
        min-height: auto;
      }

      .mode-icon {
        font-size: 2.5rem;
      }

      .mode-title {
        font-size: 1.125rem;
      }

      .mode-description {
        font-size: 0.875rem;
      }
    }
  `]
})
export class CampaignModeSelectorComponent {
  @Output() modeSelected = new EventEmitter<CampaignModeSelection>();

  readonly modes: ModeOption[] = [
    {
      mode: 'AI',
      icon: '🤖',
      title: 'Criar com IA',
      description: 'Descreva sua campanha e a IA monta tudo para você. Rápido, inteligente e eficaz.',
      isPrimary: true,
    },
    {
      mode: 'GUIDED',
      icon: '🧭',
      title: 'Criação orientada',
      description: 'Passo a passo com ajuda. Ideal para quem prefere ser guiado no processo.',
      isPrimary: false,
    },
    {
      mode: 'ADVANCED',
      icon: '⚙️',
      title: 'Criação avançada',
      description: 'Controle total das configurações. Para usuários que conhecem cada detalhe.',
      isPrimary: false,
    },
  ];

  selectMode(mode: CampaignModeSelection): void {
    this.modeSelected.emit(mode);
  }
}
