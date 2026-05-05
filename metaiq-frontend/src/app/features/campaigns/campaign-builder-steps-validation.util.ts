import {
  CampaignBuilderReviewContext,
  executivePublishBlockMessage,
  isValidCountry,
  isSecureHttpUrl,
  isLikelyDirectImageUrl,
  hasConsistentAudienceLocation,
} from './campaign-builder-review.util';
import { CampaignBuilderState, StepValidation, StepId } from './campaign-builder.types';

/**
 * FASE 7.1: STEP-BY-STEP VALIDATION UTILITIES
 * 
 * Funções de validação específicas para cada etapa do fluxo guiado.
 * 
 * Modo Manual: Configuração → Público → Criativo → Revisão
 * Modo IA:     Briefing IA → Configuração → Público → Criativo → Revisão
 */

/**
 * Valida a etapa "Objetivo"
 */
export function validateObjectiveStep(state: CampaignBuilderState): StepValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!state.ui.simpleObjective) {
    errors.push('Escolha o que você quer alcançar com a campanha');
  }

  if (!state.campaign.objective.trim()) {
    errors.push('O objetivo da campanha precisa ser definido');
  }

  return {
    errors,
    warnings,
    isComplete: errors.length === 0,
  };
}

/**
 * Valida a etapa "Produto"
 */
export function validateProductStep(state: CampaignBuilderState): StepValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!state.ui.productName.trim()) {
    errors.push('Informe o nome do produto ou serviço');
  }

  if (!state.ui.productDescription.trim()) {
    errors.push('Descreva o produto ou serviço');
  }

  if (!state.ui.productDifferential.trim()) {
    warnings.push('Vale destacar um diferencial para melhorar a mensagem do anúncio');
  }

  if (!state.identity.adAccountId) {
    errors.push('Selecione uma conta de anúncio da loja');
  }

  return {
    errors,
    warnings,
    isComplete: errors.length === 0,
  };
}

/**
 * Valida a etapa "Público"
 */
export function validateAudienceStep(state: CampaignBuilderState): StepValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // País obrigatório
  if (!isValidCountry(state.audience.country)) {
    errors.push('País é obrigatório e deve ser válido (código ISO)');
  }

  // Se Brasil e parece campanha local: exigir estado/cidade
  const isBrazil = state.audience.country.toUpperCase() === 'BR';
  if (isBrazil) {
    if (!state.audience.state && !state.audience.city) {
      warnings.push('Para campanhas locais, recomenda-se especificar estado ou cidade');
    }
  }

  // Idade coerente
  const ageMin = Number(state.audience.ageMin) || 0;
  const ageMax = Number(state.audience.ageMax) || 0;

  if (ageMin <= 0 || ageMax <= 0) {
    errors.push('Idade mínima e máxima devem ser maiores que zero');
  } else if (ageMax < ageMin) {
    errors.push('Idade máxima deve ser maior ou igual à idade mínima');
  }

  // Interesses opcionais, mas avisar se vazio
  if (!state.audience.interests && !state.audience.behaviors && !state.audience.demographics) {
    warnings.push(
      'Sem interesses/comportamentos, seu público será muito amplo. Considere adicionar segmentações.',
    );
  }

  return {
    errors,
    warnings,
    isComplete: errors.length === 0,
  };
}

/**
 * Valida a etapa "Criativo"
 */
export function validateCreativeStep(state: CampaignBuilderState): StepValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Mensagem principal
  if (!state.creative.message.trim()) {
    errors.push('Mensagem principal é obrigatória');
  } else if (state.creative.message.length > 1000) {
    errors.push('Mensagem não pode exceder 1000 caracteres');
  }

  // Headline
  if (!state.creative.headline.trim()) {
    errors.push('Headline é obrigatória');
  } else if (state.creative.headline.length > 40) {
    warnings.push('Headline com mais de 40 caracteres pode ser cortada em alguns placements');
  }

  // Descrição (opcional, mas validar se preenchida)
  if (state.creative.description && state.creative.description.length > 150) {
    warnings.push('Descrição com mais de 150 caracteres pode ser truncada');
  }

  // CTA
  if (!state.creative.cta) {
    errors.push('Call-to-action (CTA) é obrigatório');
  }

  // URL de destino
  if (!isSecureHttpUrl(state.destination.websiteUrl)) {
    errors.push('URL de destino deve ser HTTPS válida');
  }

  // Imagem
  if (!state.creative.imageUrl.trim()) {
    errors.push('Selecione uma imagem para o anúncio');
  } else if (!isLikelyDirectImageUrl(state.creative.imageUrl)) {
    errors.push('Imagem inválida. Envie ou selecione uma imagem válida da biblioteca.');
  }

  return {
    errors,
    warnings,
    isComplete: errors.length === 0,
  };
}

/**
 * Valida a etapa "Orçamento"
 */
export function validateBudgetStep(state: CampaignBuilderState): StepValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const budgetValue = Number(state.budget.value);
  if (!budgetValue || budgetValue <= 0) {
    errors.push('Defina um valor por dia maior que zero');
  } else if (budgetValue < 20) {
    warnings.push('Orçamentos abaixo de R$20 por dia podem limitar a entrega');
  }

  return {
    errors,
    warnings,
    isComplete: errors.length === 0,
  };
}

/**
/**
 * Valida a etapa "Revisão"
 */
export function validateReviewStep(
  state: CampaignBuilderState,
  context: CampaignBuilderReviewContext,
): StepValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const objectiveValidation = validateObjectiveStep(state);
  const productValidation = validateProductStep(state);
  const audienceValidation = validateAudienceStep(state);
  const creativeValidation = validateCreativeStep(state);
  const budgetValidation = validateBudgetStep(state);

  errors.push(...objectiveValidation.errors);
  errors.push(...productValidation.errors);
  errors.push(...audienceValidation.errors);
  errors.push(...creativeValidation.errors);
  errors.push(...budgetValidation.errors);

  warnings.push(...objectiveValidation.warnings);
  warnings.push(...productValidation.warnings);
  warnings.push(...audienceValidation.warnings);
  warnings.push(...creativeValidation.warnings);
  warnings.push(...budgetValidation.warnings);

  if (!context.validStoreId) {
    errors.push('Selecione uma store válida para publicar');
  }

  if (!context.integration?.pageId) {
    errors.push('Configure a página da loja antes de publicar');
  }

  const executiveBlockMessage = executivePublishBlockMessage(state);
  if (executiveBlockMessage) {
    errors.push(executiveBlockMessage);
  }

  return {
    errors,
    warnings,
    isComplete: errors.length === 0,
  };
}

/**
 * Obtém a validação apropriada para uma etapa específica
 */
export function validateStep(
  stepId: StepId,
  state: CampaignBuilderState,
  context?: CampaignBuilderReviewContext,
): StepValidation {
  // Context é necessário para algumas etapas
  if (!context) {
    return { errors: [], warnings: [], isComplete: false };
  }

  switch (stepId) {
    case 'objective':
      return validateObjectiveStep(state);
    case 'product':
      return validateProductStep(state);
    case 'audience':
      return validateAudienceStep(state);
    case 'creative':
      return validateCreativeStep(state);
    case 'budget':
      return validateBudgetStep(state);
    case 'review':
      return validateReviewStep(state, context);
    default:
      return { errors: [], warnings: [], isComplete: false };
  }
}

/**
 * Função auxiliar para verificar se há inconsistência de localização de audiência
 * (importada do campaign-builder-review.util.ts)
 */
function hasConsistentAudienceLocationHelper(state: CampaignBuilderState): boolean {
  const hasBrazil = state.audience.country.toUpperCase() === 'BR';
  const hasState = !!state.audience.state.trim();
  const hasCity = !!state.audience.city.trim();
  const hasZip = !!state.audience.zipCode.trim();

  // Se Brasil, pode ter estado/cidade/zip
  if (hasBrazil) {
    return true; // Tudo é válido no Brasil
  }

  // Para outros países, validação mais simples
  return hasState || hasCity || hasZip || !hasBrazil;
}

/**
 * Metadados das etapas para navegação e UI
 */
export const STEP_METADATA: Record<StepId, any> = {
  'objective': {
    id: 'objective',
    label: 'Objetivo',
    description: 'Escolha o resultado principal',
    order: 0,
  },
  'product': {
    id: 'product',
    label: 'Produto',
    description: 'Explique o que será anunciado',
    order: 1,
  },
  'audience': {
    id: 'audience',
    label: 'Público',
    description: 'Defina quem você quer alcançar',
    order: 2,
  },
  'creative': {
    id: 'creative',
    label: 'Criativo',
    description: 'Monte a peça do anúncio',
    order: 3,
  },
  'budget': {
    id: 'budget',
    label: 'Orçamento',
    description: 'Defina o valor por dia',
    order: 4,
  },
  'review': {
    id: 'review',
    label: 'Revisão',
    description: 'Confirme antes de criar na Meta',
    order: 5,
  },
};

/**
 * Obtém a sequência de steps baseada no modo (manual ou IA)
 */
export function getStepSequence(isAiMode: boolean): StepId[] {
  return ['objective', 'product', 'audience', 'creative', 'budget', 'review'];
}

/**
 * Obtém o step anterior na sequência
 */
export function getPreviousStep(currentStep: StepId, isAiMode: boolean): StepId | null {
  const sequence = getStepSequence(isAiMode);
  const index = sequence.indexOf(currentStep);
  return index > 0 ? sequence[index - 1] : null;
}

/**
 * Obtém o próximo step na sequência
 */
export function getNextStep(currentStep: StepId, isAiMode: boolean): StepId | null {
  const sequence = getStepSequence(isAiMode);
  const index = sequence.indexOf(currentStep);
  return index < sequence.length - 1 ? sequence[index + 1] : null;
}
