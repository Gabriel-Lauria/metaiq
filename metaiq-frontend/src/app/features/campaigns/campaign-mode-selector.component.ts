import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output } from '@angular/core';
import { CampaignModeSelection } from './campaign-builder.types';

interface ModeOption {
  mode: CampaignModeSelection;
  icon: string;
  eyebrow: string;
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
        <span class="selector-kicker">Criação de campanhas</span>
        <h1>Escolha como você quer montar esta campanha</h1>
        <p class="subtitle">Use o fluxo mais confortável para sua equipe. Você pode trocar de modo sem perder o que já preencheu.</p>
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
          <span class="mode-eyebrow">{{ mode.eyebrow }}</span>
          <h2 class="mode-title">{{ mode.title }}</h2>
          <p class="mode-description">{{ mode.description }}</p>
          <span class="mode-cta">{{ mode.isPrimary ? 'Começar por aqui' : 'Abrir modo' }}</span>
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
      gap: 2.25rem;
      padding: 2.25rem 1.25rem 1.5rem;
      max-width: 1080px;
      margin: 0 auto;
    }

    .selector-header {
      text-align: center;
      display: grid;
      gap: 0.75rem;
      justify-items: center;
    }

    .selector-kicker {
      display: inline-flex;
      align-items: center;
      min-height: 32px;
      padding: 0 0.9rem;
      border-radius: 999px;
      background: rgba(37, 99, 235, 0.08);
      color: #1d4ed8;
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .selector-header h1 {
      max-width: 760px;
      font-size: clamp(1.8rem, 3vw, 2.5rem);
      font-weight: 800;
      color: #0f172a;
      line-height: 1.08;
      margin: 0;
    }

    .subtitle {
      max-width: 760px;
      font-size: 1rem;
      color: #64748b;
      margin: 0;
      line-height: 1.65;
    }

    .modes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1rem;
    }

    .mode-card {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      padding: 1.5rem;
      border: 1px solid #dbe4ef;
      border-radius: 22px;
      background:
        radial-gradient(circle at top right, rgba(37, 99, 235, 0.05), transparent 34%),
        linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
      cursor: pointer;
      transition: transform 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease, background 0.22s ease;
      text-align: left;
      gap: 0.9rem;
      min-height: 280px;
      position: relative;
      overflow: hidden;
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
    }

    .mode-card:hover {
      border-color: rgba(37, 99, 235, 0.22);
      box-shadow: 0 26px 54px rgba(15, 23, 42, 0.1);
      transform: translateY(-3px);
    }

    .mode-card.primary {
      border-color: rgba(37, 99, 235, 0.28);
      background:
        radial-gradient(circle at top right, rgba(14, 165, 233, 0.12), transparent 36%),
        linear-gradient(135deg, rgba(239, 246, 255, 0.98) 0%, rgba(248, 250, 252, 1) 100%);
      box-shadow: 0 28px 60px rgba(37, 99, 235, 0.14);
    }

    .mode-card.primary:hover {
      border-color: #2563eb;
      box-shadow: 0 34px 70px rgba(37, 99, 235, 0.16);
    }

    .mode-icon {
      display: grid;
      place-items: center;
      width: 3.5rem;
      height: 3.5rem;
      border-radius: 1.1rem;
      background: #0f172a;
      color: #ffffff;
      font-size: 1rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      line-height: 1;
    }

    .mode-card.primary .mode-icon {
      background: linear-gradient(135deg, #2563eb, #0891b2);
    }

    .mode-eyebrow {
      color: #1d4ed8;
      font-size: 0.76rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .mode-title {
      font-size: 1.3rem;
      font-weight: 700;
      color: #0f172a;
      margin: 0;
      line-height: 1.2;
    }

    .mode-description {
      font-size: 0.95rem;
      color: #475569;
      margin: 0;
      flex: 1;
      line-height: 1.65;
    }

    .mode-cta {
      display: inline-flex;
      align-items: center;
      min-height: 2.5rem;
      padding: 0 0.95rem;
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.06);
      color: #0f172a;
      font-size: 0.88rem;
      font-weight: 700;
    }

    .badge-primary {
      position: absolute;
      top: 1.35rem;
      right: 1.35rem;
      display: inline-flex;
      align-items: center;
      min-height: 1.9rem;
      padding: 0 0.75rem;
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
      padding: 0.25rem 0 0;
    }

    .help-text {
      font-size: 0.875rem;
      color: #64748b;
      margin: 0;
      line-height: 1.55;
    }

    @media (max-width: 768px) {
      .mode-selector-container {
        padding: 0.5rem 0 0;
        gap: 1.5rem;
      }

      .modes-grid {
        grid-template-columns: 1fr;
      }

      .selector-header h1 {
        font-size: 1.5rem;
      }

      .subtitle {
        font-size: 0.95rem;
      }

      .mode-card {
        padding: 1.5rem;
        min-height: auto;
      }

      .mode-icon {
        width: 3rem;
        height: 3rem;
      }

      .badge-primary {
        top: 1rem;
        right: 1rem;
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
      icon: 'IA',
      eyebrow: 'Mais rápido',
      title: 'Criar com IA',
      description: 'Descreva o objetivo da campanha e receba uma primeira versão com estrutura, copy e direção de público para revisar.',
      isPrimary: true,
    },
    {
      mode: 'GUIDED',
      icon: 'GUIA',
      eyebrow: 'Passo a passo',
      title: 'Criação orientada',
      description: 'Preencha etapa por etapa com uma experiência mais simples, pensada para pequenas empresas e times enxutos.',
      isPrimary: false,
    },
    {
      mode: 'ADVANCED',
      icon: 'PRO',
      eyebrow: 'Mais controle',
      title: 'Criação avançada',
      description: 'Acesse todos os campos do builder para revisar detalhes de segmentação, criativo e mensuração com mais liberdade.',
      isPrimary: false,
    },
  ];

  selectMode(mode: CampaignModeSelection): void {
    this.modeSelected.emit(mode);
  }
}
