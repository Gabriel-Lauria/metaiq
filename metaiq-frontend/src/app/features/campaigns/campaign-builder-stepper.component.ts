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
      gap: 1.5rem;
      padding: 1.5rem;
      background: #f8fafc;
      border-radius: 12px;
    }

    .stepper-progress {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .progress-bar-track {
      flex: 1;
      height: 4px;
      background: #e2e8f0;
      border-radius: 2px;
      overflow: hidden;
    }

    .progress-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #3b82f6, #2563eb);
      transition: width 0.3s ease-out;
    }

    .progress-label {
      font-size: 0.875rem;
      font-weight: 500;
      color: #475569;
      white-space: nowrap;
      min-width: 80px;
      text-align: right;
    }

    .stepper-list {
      display: flex;
      list-style: none;
      padding: 0;
      margin: 0;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .stepper-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      position: relative;
      flex: 1;
      min-width: 120px;
    }

    .stepper-button {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      color: #475569;
      cursor: pointer;
      transition: all 0.2s ease;
      flex: 1;
    }

    .stepper-button:hover:not(:disabled) {
      border-color: #cbd5e1;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }

    .stepper-button:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }

    /* Estado: PENDING */
    .stepper-item.pending .stepper-button {
      background: #f1f5f9;
    }

    /* Estado: CURRENT */
    .stepper-item.current .stepper-button {
      background: white;
      border-color: #3b82f6;
      color: #1e40af;
      font-weight: 600;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    /* Estado: COMPLETED */
    .stepper-item.completed .stepper-button {
      background: #ecfdf5;
      border-color: #10b981;
      color: #059669;
    }

    /* Estado: ERROR */
    .stepper-item.error .stepper-button {
      background: #fef2f2;
      border-color: #ef4444;
      color: #dc2626;
    }

    .step-indicator {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 1.5rem;
      height: 1.5rem;
      border-radius: 50%;
      font-size: 0.75rem;
      font-weight: 600;
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
      position: absolute;
      top: 50%;
      left: 100%;
      width: 0.75rem;
      height: 2px;
      background: #e2e8f0;
      transform: translateY(-50%);
      margin: 0 -0.75rem;
    }

    .step-connector.completed {
      background: #10b981;
    }

    /* Responsivo: Mobile */
    @media (max-width: 768px) {
      .stepper-container {
        padding: 1rem;
        gap: 1rem;
      }

      .stepper-list {
        gap: 0.5rem;
        flex-direction: column;
      }

      .stepper-item {
        flex: 1 0 auto;
        min-width: auto;
      }

      .step-connector {
        display: none;
      }

      .stepper-button {
        padding: 0.625rem 0.875rem;
        font-size: 0.8125rem;
      }

      .step-indicator {
        width: 1.25rem;
        height: 1.25rem;
        font-size: 0.6875rem;
      }

      .step-label {
        display: none;
      }

      .stepper-item.current .step-label {
        display: inline;
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
