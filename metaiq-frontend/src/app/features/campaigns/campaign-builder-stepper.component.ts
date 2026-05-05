import { CommonModule } from '@angular/common';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { StepId } from './campaign-builder.types';

export interface StepperItem {
  id: StepId;
  label: string;
  status: 'pending' | 'current' | 'completed' | 'error';
  order: number;
}

/**
 * FASE 7.1: CAMPAIGN BUILDER STEPPER COMPONENT
 * 
 * Componente de navegação visual para o fluxo step-by-step.
 * Mostra:
 * - Etapa atual destacada
 * - Etapas completas com checkmark
 * - Etapas com erro com alerta
 * - Progresso geral
 */
@Component({
  selector: 'app-campaign-builder-stepper',
  standalone: true,
  imports: [CommonModule],
  template: `
    <nav class="stepper-container" role="navigation" [attr.aria-label]="'Progresso da criação de campanha'">
      <!-- Barra de progresso geral -->
      <div class="stepper-progress">
        <div class="progress-bar-track">
          <div class="progress-bar-fill" [style.width.%]="progressPercent"></div>
        </div>
        <span class="progress-label">{{ currentStepLabel }} de {{ totalSteps }}</span>
      </div>

      <!-- Steps -->
      <ol class="stepper-list">
        <li
          *ngFor="let step of steps; let i = index; trackBy: trackByStepId"
          class="stepper-item"
          [class.pending]="step.status === 'pending'"
          [class.current]="step.status === 'current'"
          [class.completed]="step.status === 'completed'"
          [class.error]="step.status === 'error'"
          [attr.aria-current]="step.status === 'current' ? 'step' : null"
        >
          <button
            type="button"
            class="stepper-button"
            [disabled]="step.status === 'pending' || step.status === 'error'"
            (click)="onStepClick(step.id)"
            [attr.aria-label]="getAriaLabel(step)"
          >
            <!-- Indicador de status -->
            <div class="step-indicator">
              <div *ngIf="step.status === 'completed'" class="step-icon step-check">✓</div>
              <div *ngIf="step.status === 'error'" class="step-icon step-error">!</div>
              <div *ngIf="step.status === 'current'" class="step-icon step-current">{{ i + 1 }}</div>
              <div *ngIf="step.status === 'pending'" class="step-icon step-pending">{{ i + 1 }}</div>
            </div>

            <!-- Rótulo -->
            <span class="step-label">{{ step.label }}</span>
          </button>

          <!-- Conector para próximo step -->
          <div *ngIf="i < steps.length - 1" class="step-connector" [class.completed]="step.status === 'completed'">
          </div>
        </li>
      </ol>
    </nav>
  `,
  styles: [`
    .stepper-container {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 1rem 1.25rem 0.25rem;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.98) 100%);
      border-radius: 18px;
    }

    .stepper-progress {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.15rem 0;
    }

    .progress-bar-track {
      flex: 1;
      height: 8px;
      background: #dbe7f4;
      border-radius: 999px;
      overflow: hidden;
    }

    .progress-bar-fill {
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #0891b2, #2563eb);
      transition: width 0.3s ease-out;
    }

    .progress-label {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 2rem;
      min-width: 90px;
      padding: 0 0.8rem;
      border-radius: 999px;
      background: rgba(37, 99, 235, 0.08);
      font-size: 0.8125rem;
      font-weight: 700;
      color: #1d4ed8;
      white-space: nowrap;
      text-align: center;
    }

    .stepper-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      list-style: none;
      padding: 0;
      margin: 0;
      gap: 0.75rem;
    }

    .stepper-item {
      display: flex;
      align-items: stretch;
      gap: 0.75rem;
      position: relative;
      min-width: 0;
    }

    .stepper-button {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      padding: 0.95rem 1rem;
      background: #ffffff;
      border: 1px solid #dbe4ef;
      border-radius: 16px;
      font-size: 0.875rem;
      font-weight: 600;
      color: #475569;
      cursor: pointer;
      transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
      flex: 1;
      min-width: 0;
      text-align: left;
      box-shadow: 0 12px 28px rgba(15, 23, 42, 0.05);
    }

    .stepper-button:hover:not(:disabled) {
      border-color: rgba(37, 99, 235, 0.24);
      box-shadow: 0 18px 32px rgba(37, 99, 235, 0.1);
      transform: translateY(-1px);
    }

    .stepper-button:disabled {
      cursor: not-allowed;
      opacity: 0.72;
      box-shadow: none;
    }

    .stepper-item.pending .stepper-button {
      background: #f8fafc;
    }

    .stepper-item.current .stepper-button {
      background: linear-gradient(135deg, rgba(239, 246, 255, 0.96), rgba(255, 255, 255, 1));
      border-color: #60a5fa;
      color: #1e40af;
      font-weight: 600;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.08), 0 16px 34px rgba(37, 99, 235, 0.1);
    }

    .stepper-item.completed .stepper-button {
      background: linear-gradient(180deg, rgba(240, 253, 244, 0.95), #ffffff);
      border-color: #10b981;
      color: #059669;
    }

    .stepper-item.error .stepper-button {
      background: linear-gradient(180deg, rgba(254, 242, 242, 0.96), #ffffff);
      border-color: #ef4444;
      color: #dc2626;
    }

    .step-indicator {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 1.9rem;
      height: 1.9rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 700;
      flex-shrink: 0;
    }

    .step-pending {
      background: #cbd5e1;
      color: white;
    }

    .step-current {
      background: #3b82f6;
      color: white;
    }

    .step-check {
      background: #10b981;
      color: white;
    }

    .step-error {
      background: #ef4444;
      color: white;
    }

    .step-label {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .step-connector {
      display: none;
    }

    .step-connector.completed {
      background: #10b981;
    }

    @media (max-width: 768px) {
      .stepper-container {
        padding: 0.25rem 0 0;
        gap: 1rem;
      }

      .stepper-list {
        gap: 0.5rem;
        grid-template-columns: 1fr;
      }

      .stepper-item {
        flex: 1 0 auto;
        min-width: auto;
      }

      .stepper-button {
        padding: 0.75rem 0.875rem;
        font-size: 0.8125rem;
        border-radius: 14px;
      }

      .step-indicator {
        width: 1.55rem;
        height: 1.55rem;
        font-size: 0.6875rem;
      }

      .progress-label {
        min-width: 78px;
        padding: 0 0.65rem;
        font-size: 0.75rem;
      }
    }
  `],
})
export class CampaignBuilderStepperComponent {
  @Input() steps: StepperItem[] = [];
  @Input() currentStepIndex = 0;
  @Output() stepSelected = new EventEmitter<StepId>();

  get progressPercent(): number {
    if (!this.steps.length) return 0;
    const completedCount = this.steps.filter((s) => s.status === 'completed').length;
    return (completedCount / this.steps.length) * 100;
  }

  get currentStepLabel(): string {
    return (this.currentStepIndex + 1).toString();
  }

  get totalSteps(): string {
    return this.steps.length.toString();
  }

  trackByStepId(index: number, step: StepperItem): string {
    return step.id;
  }

  onStepClick(stepId: StepId): void {
    this.stepSelected.emit(stepId);
  }

  getAriaLabel(step: StepperItem): string {
    const statusLabels: Record<string, string> = {
      pending: 'não iniciada',
      current: 'em progresso',
      completed: 'completada',
      error: 'com erro',
    };
    return `${step.label}, ${statusLabels[step.status]}`;
  }
}
