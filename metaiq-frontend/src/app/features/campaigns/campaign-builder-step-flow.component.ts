import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, input, signal, effect, computed } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CampaignCreatePanelComponent } from './campaign-create-panel.component';
import { CampaignBuilderStepperComponent, StepperItem } from './campaign-builder-stepper.component';
import {
  buildAllStepValidations,
  buildStepStateContext,
  buildStepProgressLabel,
  CampaignBuilderStepStateManager,
} from './campaign-builder-step-state.util';
import {
  getStepSequence,
  getNextStep,
  getPreviousStep,
} from './campaign-builder-steps-validation.util';
import { CampaignBuilderState, StepId, CampaignCreationEntryMode } from './campaign-builder.types';
import { CampaignBuilderReviewContext } from './campaign-builder-review.util';

/**
 * FASE 7.1: CAMPAIGN BUILDER STEP-BY-STEP WRAPPER COMPONENT
 * 
 * Componente wrapper que fornece a UX step-by-step para o Campaign Builder existente.
 * 
 * Este componente:
 * 1. Gerencia o fluxo de steps (configuration → audience → creative → review)
 * 2. Renderiza o stepper visual
 * 3. Valida cada step antes de avançar
 * 4. Mostra/oculta seções baseado no step atual
 * 5. Mantém a compatibilidade com o componente existente
 * 
 * Estratégia:
 * - Não refatora o componente existente
 * - Adiciona camada de UI sobre componente existente
 * - Gerencia validações e transições de steps
 * - Preserva toda lógica de backend/Meta
 */
@Component({
  selector: 'app-campaign-builder-step-flow',
  standalone: true,
  imports: [CommonModule, CampaignCreatePanelComponent, CampaignBuilderStepperComponent],
  template: `
    <div class="step-flow-container">
      <!-- Header Compacto e Profissional -->
      <header class="step-flow-header">
        <div class="header-content">
          <div class="header-left">
            <h1 class="header-title">Criar campanha</h1>
            <span class="header-mode" [class.ai-mode]="isAiMode()">
              {{ entryMode() === 'ai' ? '✨ Modo IA' : 'Modo Manual' }}
            </span>
          </div>
          <div class="header-progress">
            <span class="progress-text">{{ progressLabel() }}</span>
          </div>
        </div>
      </header>

      <!-- Stepper Navigation Visual -->
      <app-campaign-builder-stepper
        [steps]="stepperItems()"
        [currentStepIndex]="currentStepIndex()"
        (stepSelected)="onStepSelected($event)"
      ></app-campaign-builder-stepper>

      <!-- Conteúdo da Etapa Atual -->
      <main class="step-content" [attr.data-step]="currentStep()">
        <!-- ETAPA: Briefing IA (apenas modo IA) -->
        <section class="step-section" *ngIf="currentStep() === 'briefing-ia'" [@fadeIn]>
          <div class="step-section-inner">
            <h2 class="step-title">Briefing IA</h2>
            <p class="step-description">Descreva sua campanha em linguagem natural e deixe a IA gerar uma primeira versão.</p>
            
            <!-- Componente existente renderizado aqui para briefing -->
            <div class="ai-briefing-form">
              <!-- Este será preenchido via content projection do componente existente -->
              <!-- A lógica de IA permanece no componente existente -->
              <p class="placeholder">Formulário de briefing IA será renderizado aqui</p>
            </div>

            <!-- Botões de navegação -->
            <div class="step-actions">
              <button type="button" class="btn btn-secondary" (click)="goToPreviousStep()" [disabled]="!canGoPrevious()">
                ← Voltar
              </button>
              <button type="button" class="btn btn-primary" (click)="goToNextStep()" [disabled]="!canAdvance()">
                Próximo: Configuração →
              </button>
            </div>
          </div>
        </section>

        <!-- ETAPA: Configuração -->
        <section class="step-section" *ngIf="currentStep() === 'configuration'" [@fadeIn]>
          <div class="step-section-inner">
            <h2 class="step-title">Configuração</h2>
            <p class="step-description">Nome, objetivo, conta de anúncio e orçamento.</p>
            
            <div class="step-form">
              <p class="placeholder">Seção "Configuração" do formulário será renderizada aqui</p>
            </div>

            <div class="step-validation" *ngIf="currentStepValidation()?.errors.length">
              <div class="validation-errors">
                <h4>Erros obrigatórios:</h4>
                <ul>
                  <li *ngFor="let error of currentStepValidation()?.errors">{{ error }}</li>
                </ul>
              </div>
            </div>

            <div class="step-validation" *ngIf="currentStepValidation()?.warnings.length">
              <div class="validation-warnings">
                <h4>Avisos:</h4>
                <ul>
                  <li *ngFor="let warning of currentStepValidation()?.warnings">{{ warning }}</li>
                </ul>
              </div>
            </div>

            <div class="step-actions">
              <button type="button" class="btn btn-secondary" (click)="goToPreviousStep()" [disabled]="!canGoPrevious()">
                ← Voltar
              </button>
              <button type="button" class="btn btn-primary" (click)="goToNextStep()" [disabled]="!canAdvance()">
                Próximo: Público →
              </button>
            </div>
          </div>
        </section>

        <!-- ETAPA: Público -->
        <section class="step-section" *ngIf="currentStep() === 'audience'" [@fadeIn]>
          <div class="step-section-inner">
            <h2 class="step-title">Público</h2>
            <p class="step-description">País, localização, idade e interesses.</p>
            
            <div class="step-form">
              <p class="placeholder">Seção "Público" do formulário será renderizada aqui</p>
            </div>

            <div class="step-validation" *ngIf="currentStepValidation()?.errors.length">
              <div class="validation-errors">
                <h4>Erros obrigatórios:</h4>
                <ul>
                  <li *ngFor="let error of currentStepValidation()?.errors">{{ error }}</li>
                </ul>
              </div>
            </div>

            <div class="step-validation" *ngIf="currentStepValidation()?.warnings.length">
              <div class="validation-warnings">
                <h4>Avisos:</h4>
                <ul>
                  <li *ngFor="let warning of currentStepValidation()?.warnings">{{ warning }}</li>
                </ul>
              </div>
            </div>

            <div class="step-actions">
              <button type="button" class="btn btn-secondary" (click)="goToPreviousStep()">
                ← Voltar
              </button>
              <button type="button" class="btn btn-primary" (click)="goToNextStep()" [disabled]="!canAdvance()">
                Próximo: Criativo →
              </button>
            </div>
          </div>
        </section>

        <!-- ETAPA: Criativo -->
        <section class="step-section" *ngIf="currentStep() === 'creative'" [@fadeIn]>
          <div class="step-section-container">
            <div class="step-section-inner">
              <h2 class="step-title">Criativo</h2>
              <p class="step-description">Mensagem, headline, CTA, URL e imagem.</p>
              
              <div class="step-form">
                <p class="placeholder">Seção "Criativo" do formulário será renderizada aqui</p>
              </div>

              <div class="step-validation" *ngIf="currentStepValidation()?.errors.length">
                <div class="validation-errors">
                  <h4>Erros obrigatórios:</h4>
                  <ul>
                    <li *ngFor="let error of currentStepValidation()?.errors">{{ error }}</li>
                  </ul>
                </div>
              </div>

              <div class="step-validation" *ngIf="currentStepValidation()?.warnings.length">
                <div class="validation-warnings">
                  <h4>Avisos:</h4>
                  <ul>
                    <li *ngFor="let warning of currentStepValidation()?.warnings">{{ warning }}</li>
                  </ul>
                </div>
              </div>

              <div class="step-actions">
                <button type="button" class="btn btn-secondary" (click)="goToPreviousStep()">
                  ← Voltar
                </button>
                <button type="button" class="btn btn-primary" (click)="goToNextStep()" [disabled]="!canAdvance()">
                  Próximo: Revisão →
                </button>
              </div>
            </div>

            <!-- Preview do criativo à direita (desktop) -->
            <aside class="step-preview" *ngIf="showPreview()">
              <h3>Preview</h3>
              <div class="preview-placeholder">Preview será renderizado aqui</div>
            </aside>
          </div>
        </section>

        <!-- ETAPA: Revisão -->
        <section class="step-section" *ngIf="currentStep() === 'review'" [@fadeIn]>
          <div class="step-section-inner">
            <h2 class="step-title">Revisão Final</h2>
            <p class="step-description">Confirme os detalhes antes de criar a campanha na Meta.</p>
            
            <div class="review-summary">
              <p class="placeholder">Resumo completo da campanha será renderizado aqui</p>
            </div>

            <div class="step-validation" *ngIf="currentStepValidation()?.errors.length">
              <div class="validation-errors">
                <h4>Erros obrigatórios - Corrija antes de criar:</h4>
                <ul>
                  <li *ngFor="let error of currentStepValidation()?.errors">{{ error }}</li>
                </ul>
              </div>
            </div>

            <div class="step-actions step-actions-review">
              <button type="button" class="btn btn-secondary" (click)="goToPreviousStep()">
                ← Voltar
              </button>
              <button 
                type="button" 
                class="btn btn-success" 
                (click)="onCreateCampaign()" 
                [disabled]="!canCreate()"
              >
                ✓ Criar na Meta
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  `,
  styles: [`
    .step-flow-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #f8fafc;
    }

    .step-flow-header {
      padding: 1.5rem;
      background: white;
      border-bottom: 1px solid #e2e8f0;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }

    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      max-width: 1200px;
      margin: 0 auto;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .header-title {
      font-size: 1.5rem;
      font-weight: 600;
      color: #1e293b;
      margin: 0;
    }

    .header-mode {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      background: #f1f5f9;
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 500;
      color: #475569;
    }

    .header-mode.ai-mode {
      background: #fef3c7;
      color: #92400e;
    }

    .header-progress {
      text-align: right;
    }

    .progress-text {
      font-size: 0.875rem;
      font-weight: 500;
      color: #64748b;
    }

    .step-content {
      flex: 1;
      overflow-y: auto;
      padding: 2rem;
      max-width: 1200px;
      margin: 0 auto;
      width: 100%;
    }

    .step-section {
      animation: fadeIn 0.3s ease-in;
    }

    .step-section-inner {
      background: white;
      border-radius: 12px;
      padding: 2rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }

    .step-section-container {
      display: grid;
      grid-template-columns: 1fr 350px;
      gap: 2rem;
    }

    .step-title {
      font-size: 1.5rem;
      font-weight: 600;
      color: #1e293b;
      margin: 0 0 0.5rem 0;
    }

    .step-description {
      font-size: 0.875rem;
      color: #64748b;
      margin: 0 0 2rem 0;
    }

    .step-form {
      margin-bottom: 2rem;
    }

    .placeholder {
      padding: 2rem;
      background: #f1f5f9;
      border-radius: 8px;
      color: #94a3b8;
      font-size: 0.875rem;
      margin: 0;
    }

    .step-validation {
      margin-bottom: 1.5rem;
      padding: 1rem;
      border-radius: 8px;
    }

    .validation-errors {
      padding: 1rem;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      color: #dc2626;
    }

    .validation-errors h4,
    .validation-warnings h4 {
      margin: 0 0 0.5rem 0;
      font-size: 0.875rem;
      font-weight: 600;
    }

    .validation-errors ul,
    .validation-warnings ul {
      margin: 0;
      padding-left: 1.5rem;
      font-size: 0.875rem;
    }

    .validation-errors li,
    .validation-warnings li {
      margin: 0.25rem 0;
    }

    .validation-warnings {
      padding: 1rem;
      background: #fffbeb;
      border: 1px solid #fcd34d;
      border-radius: 8px;
      color: #92400e;
    }

    .step-actions {
      display: flex;
      gap: 1rem;
      margin-top: 2rem;
      justify-content: flex-start;
    }

    .step-actions-review {
      justify-content: space-between;
    }

    .btn {
      padding: 0.75rem 1.5rem;
      border: none;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-primary {
      background: #3b82f6;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: #2563eb;
      box-shadow: 0 4px 6px rgba(37, 99, 235, 0.2);
    }

    .btn-secondary {
      background: #f1f5f9;
      color: #475569;
      border: 1px solid #e2e8f0;
    }

    .btn-secondary:hover:not(:disabled) {
      background: #e2e8f0;
    }

    .btn-success {
      background: #10b981;
      color: white;
    }

    .btn-success:hover:not(:disabled) {
      background: #059669;
      box-shadow: 0 4px 6px rgba(16, 185, 129, 0.2);
    }

    .step-preview {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      position: sticky;
      top: 2rem;
      height: fit-content;
    }

    .step-preview h3 {
      margin: 0 0 1rem 0;
      font-size: 1rem;
      font-weight: 600;
      color: #1e293b;
    }

    .preview-placeholder {
      padding: 2rem 1rem;
      background: #f1f5f9;
      border-radius: 8px;
      color: #94a3b8;
      font-size: 0.875rem;
      text-align: center;
    }

    .review-summary {
      background: #f8fafc;
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 2rem;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    /* Responsivo: Mobile */
    @media (max-width: 768px) {
      .step-flow-header {
        padding: 1rem;
      }

      .header-content {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.75rem;
      }

      .step-content {
        padding: 1rem;
      }

      .step-section-inner {
        padding: 1rem;
      }

      .step-section-container {
        grid-template-columns: 1fr;
      }

      .step-preview {
        position: static;
        top: auto;
      }

      .step-actions {
        flex-direction: column;
      }

      .step-actions-review {
        flex-direction: column-reverse;
      }

      .btn {
        width: 100%;
      }
    }
  `],
})
export class CampaignBuilderStepFlowComponent {
  private destroyRef = inject(DestroyRef);

  // Inputs
  readonly entryMode = input<CampaignCreationEntryMode>('manual');

  // Signals
  readonly currentStep = signal<StepId>('configuration');
  readonly isAiMode = computed(() => this.entryMode() === 'ai');
  readonly stepValidations = signal<Record<StepId, any>>({});
  readonly campaignState = signal<CampaignBuilderState | null>(null);
  readonly reviewContext = signal<CampaignBuilderReviewContext | null>(null);

  // Computed values
  readonly currentStepIndex = computed(() => {
    const sequence = getStepSequence(this.isAiMode());
    return sequence.indexOf(this.currentStep());
  });

  readonly progressLabel = computed(() => buildStepProgressLabel(this.currentStep(), this.isAiMode()));

  readonly stepperItems = computed(() => {
    const stepStateManager = new CampaignBuilderStepStateManager(
      this.currentStep,
      this.entryMode,
      this.isAiMode,
    );

    return stepStateManager.computeStepperItems(
      this.currentStep(),
      this.stepValidations(),
      this.isAiMode(),
    );
  });

  readonly currentStepValidation = computed(() => {
    return this.stepValidations()[this.currentStep()];
  });

  readonly showPreview = computed(() => {
    return this.currentStep() === 'creative' && window.innerWidth >= 1024;
  });

  readonly canAdvance = computed(() => {
    const validation = this.currentStepValidation();
    return validation && validation.isComplete;
  });

  readonly canGoPrevious = computed(() => {
    const sequence = getStepSequence(this.isAiMode());
    return sequence.indexOf(this.currentStep()) > 0;
  });

  readonly canCreate = computed(() => {
    const validation = this.stepValidations()['review'];
    return validation && validation.isComplete;
  });

  /**
   * Avança para o próximo step
   */
  goToNextStep(): void {
    if (!this.canAdvance()) {
      return;
    }

    const nextStep = getNextStep(this.currentStep(), this.isAiMode());
    if (nextStep) {
      this.currentStep.set(nextStep);
      this.scrollToTop();
    }
  }

  /**
   * Volta para o step anterior
   */
  goToPreviousStep(): void {
    const previousStep = getPreviousStep(this.currentStep(), this.isAiMode());
    if (previousStep) {
      this.currentStep.set(previousStep);
      this.scrollToTop();
    }
  }

  /**
   * Pula para um step específico (se for anterior)
   */
  onStepSelected(stepId: StepId): void {
    const sequence = getStepSequence(this.isAiMode());
    const currentIndex = sequence.indexOf(this.currentStep());
    const targetIndex = sequence.indexOf(stepId);

    if (targetIndex <= currentIndex) {
      this.currentStep.set(stepId);
      this.scrollToTop();
    }
  }

  /**
   * Cria a campanha na Meta
   */
  onCreateCampaign(): void {
    if (!this.canCreate()) {
      return;
    }
    // Lógica de submissão será delegada ao componente pai
    console.log('Criar campanha na Meta');
  }

  private scrollToTop(): void {
    document.querySelector('.step-content')?.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
