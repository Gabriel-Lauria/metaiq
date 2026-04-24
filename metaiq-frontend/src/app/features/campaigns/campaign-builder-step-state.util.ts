import { computed, signal, Signal } from '@angular/core';
import { CampaignBuilderState, StepId, StepValidation, CampaignBuilderStepState } from './campaign-builder.types';
import { StepperItem } from './campaign-builder-stepper.component';
import {
  validateStep,
  getStepSequence,
  getPreviousStep,
  getNextStep,
  STEP_METADATA,
} from './campaign-builder-steps-validation.util';
import { CampaignBuilderReviewContext } from './campaign-builder-review.util';

/**
 * FASE 7.1: STEP STATE MANAGER
 * 
 * Classe para gerenciar o estado de progresso do fluxo step-by-step.
 * Gerencia:
 * - Etapa atual
 * - Validações por etapa
 * - Transições entre etapas
 * - Status visual (pending/current/completed/error)
 */
export class CampaignBuilderStepStateManager {
  private currentStepSignal: Signal<StepId>;
  private entryModeSignal: Signal<'manual' | 'ai'>;
  private isAiModeSignal: Signal<boolean>;
  private submitAttemptedSignal = signal(false);
  private validationsSignal = signal<Record<StepId, StepValidation>>({
    'briefing-ia': { errors: [], warnings: [], isComplete: false },
    'configuration': { errors: [], warnings: [], isComplete: false },
    'audience': { errors: [], warnings: [], isComplete: false },
    'creative': { errors: [], warnings: [], isComplete: false },
    'review': { errors: [], warnings: [], isComplete: false },
  });

  constructor(
    currentStep: Signal<StepId>,
    entryMode: Signal<'manual' | 'ai'>,
    isAiMode: Signal<boolean>,
  ) {
    this.currentStepSignal = currentStep;
    this.entryModeSignal = entryMode;
    this.isAiModeSignal = isAiMode;
  }

  /**
   * Calcula os items do stepper baseado no estado atual
   */
  computeStepperItems(
    currentStep: StepId,
    stepValidations: Record<StepId, StepValidation>,
    isAiMode: boolean,
  ): StepperItem[] {
    const sequence = getStepSequence(isAiMode);
    return sequence.map((stepId, index) => {
      const validation = stepValidations[stepId];
      let status: 'pending' | 'current' | 'completed' | 'error' = 'pending';

      if (stepId === currentStep) {
        status = 'current';
      } else if (sequence.indexOf(stepId) < sequence.indexOf(currentStep)) {
        status = validation && validation.isComplete ? 'completed' : 'error';
      } else if (validation && validation.errors.length > 0) {
        status = 'error';
      }

      const metadata = STEP_METADATA[stepId as keyof typeof STEP_METADATA];
      return {
        id: stepId,
        label: metadata.label,
        status,
        order: metadata.order,
      };
    });
  }

  /**
   * Avança para o próximo step se a validação passar
   */
  advanceStep(
    currentStep: StepId,
    stepValidations: Record<StepId, StepValidation>,
    isAiMode: boolean,
  ): StepId | null {
    const validation = stepValidations[currentStep];
    if (validation && validation.errors.length > 0) {
      return null; // Não pode avançar com erros
    }

    const nextStep = getNextStep(currentStep, isAiMode);
    return nextStep;
  }

  /**
   * Volta para o passo anterior
   */
  regressStep(currentStep: StepId, isAiMode: boolean): StepId | null {
    return getPreviousStep(currentStep, isAiMode);
  }

  /**
   * Pula para um step específico (se for anterior ou atual)
   */
  jumpToStep(targetStep: StepId, currentStep: StepId, isAiMode: boolean): StepId | null {
    const sequence = getStepSequence(isAiMode);
    const currentIndex = sequence.indexOf(currentStep);
    const targetIndex = sequence.indexOf(targetStep);

    if (targetIndex <= currentIndex) {
      return targetStep;
    }

    return null; // Não pode pular para frente
  }

  /**
   * Atualiza a validação de um step
   */
  updateStepValidation(stepId: StepId, validation: StepValidation): void {
    this.validationsSignal.update((curr) => ({
      ...curr,
      [stepId]: validation,
    }));
  }

  /**
   * Marca que o usuário tentou submeter
   */
  markSubmitAttempted(): void {
    this.submitAttemptedSignal.set(true);
  }

  /**
   * Retorna o sinal de tentativa de submit
   */
  get submitAttempted(): Signal<boolean> {
    return this.submitAttemptedSignal;
  }

  /**
   * Retorna o sinal de validações
   */
  get validations(): Signal<Record<StepId, StepValidation>> {
    return this.validationsSignal;
  }
}

/**
 * Funções auxiliares para integração com o componente existente
 */

/**
 * Obtém o mapa de validações para todas as etapas
 */
export function buildAllStepValidations(
  state: CampaignBuilderState,
  context: CampaignBuilderReviewContext | undefined,
  isAiMode: boolean,
): Record<StepId, StepValidation> {
  const sequence = getStepSequence(isAiMode);
  const validations: Record<StepId, StepValidation> = {
    'briefing-ia': { errors: [], warnings: [], isComplete: false },
    'configuration': { errors: [], warnings: [], isComplete: false },
    'audience': { errors: [], warnings: [], isComplete: false },
    'creative': { errors: [], warnings: [], isComplete: false },
    'review': { errors: [], warnings: [], isComplete: false },
  };

  for (const stepId of sequence) {
    validations[stepId] = validateStep(stepId, state, context);
  }

  return validations;
}

/**
 * Cria um contexto de step baseado no estado atual
 */
export function buildStepStateContext(
  currentStep: StepId,
  entryMode: 'manual' | 'ai',
  stepValidations: Record<StepId, StepValidation>,
): CampaignBuilderStepState {
  const isAiMode = entryMode === 'ai';
  const sequence = getStepSequence(isAiMode);
  const completedSteps: StepId[] = [];

  for (let i = 0; i < sequence.indexOf(currentStep); i++) {
    const stepId = sequence[i];
    const validation = stepValidations[stepId];
    if (validation && validation.isComplete) {
      completedSteps.push(stepId);
    }
  }

  return {
    currentStep,
    entryMode,
    isAiMode,
    currentStepValidation: stepValidations[currentStep] || {
      errors: [],
      warnings: [],
      isComplete: false,
    },
    stepValidations,
    completedSteps,
    submitAttempted: false,
  };
}

/**
 * Monta o label de progresso do step
 */
export function buildStepProgressLabel(currentStep: StepId, isAiMode: boolean): string {
  const sequence = getStepSequence(isAiMode);
  const index = sequence.indexOf(currentStep);
  return `Etapa ${index + 1} de ${sequence.length}`;
}
