import {
  CampaignBuilderReviewContext,
  isValidCountry,
  isSecureHttpUrl,
  isLikelyDirectImageUrl,
  identitySectionComplete,
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
 * Valida a etapa "Briefing IA"
 * Apenas aparece em modo IA
 * 
 * Validação: O usuário preencheu o prompt com contexto suficiente
 */
export function validateBriefingIaStep(state: CampaignBuilderState): StepValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const hasPrompt = (state.ui.aiPrompt || '').trim().length > 0;
  const hasGoal = (state.ui.aiGoal || '').trim().length > 0;
  const hasDestinationType = (state.ui.aiDestinationType || '').trim().length > 0;

  if (!hasPrompt) {
    errors.push('Descreva o objetivo da campanha');
  }

  if (!hasGoal) {
    errors.push('Defina o resultado principal que espera');
  }

  if (!hasDestinationType) {
    errors.push('Indique para onde levará o tráfego');
  }

  const hasPrimaryOffer = (state.ui.aiPrimaryOffer || '').trim().length > 0;
  if (!hasPrimaryOffer) {
    warnings.push('Adicione informações sobre sua oferta/produto para melhores sugestões');
  }

  return {
    errors,
    warnings,
    isComplete: errors.length === 0,
  };
}

/**
 * Valida a etapa "Configuração"
 * Modo: Manual e IA (após briefing)
 * 
 * Campos obrigatórios: Nome, Objetivo, Conta de anúncio, Orçamento, Status
 */
export function validateConfigurationStep(
  state: CampaignBuilderState,
  context: CampaignBuilderReviewContext,
): StepValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Nome da campanha
  if (!state.campaign.name.trim()) {
    errors.push('Nome da campanha é obrigatório');
  } else if (state.campaign.name.length > 100) {
    errors.push('Nome da campanha não pode exceder 100 caracteres');
  }

  // Objetivo
  if (!state.campaign.objective.trim()) {
    errors.push('Escolha um objetivo para a campanha');
  }

  // Conta de anúncio (validar contexto)
  if (!identitySectionComplete(context)) {
    errors.push('Selecione uma conta de anúncio válida');
  }

  // Orçamento
  const budgetValue = Number(state.budget.value);
  if (!state.budget.value || budgetValue <= 0) {
    errors.push('Orçamento deve ser maior que zero');
  } else if (budgetValue < 5) {
    warnings.push('Orçamentos abaixo de R$ 5,00 podem ter alcance limitado');
  }

  // Status inicial
  if (!state.campaign.initialStatus) {
    errors.push('Defina o status inicial da campanha');
  }

  return {
    errors,
    warnings,
    isComplete: errors.length === 0,
  };
}

/**
 * Valida a etapa "Público"
 * Modo: Manual e IA
 * 
 * Validações: País obrigatório, se BR e local: estado/cidade, idade coerente
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
 * Modo: Manual e IA
 * 
 * Validações: Mensagem, Headline, URL destino (HTTPS), Imagem, CTA
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
    errors.push('Imagem é obrigatória');
  } else if (!isLikelyDirectImageUrl(state.creative.imageUrl)) {
    errors.push('URL da imagem inválida. Use uma URL HTTP(S) direta.');
  }

  return {
    errors,
    warnings,
    isComplete: errors.length === 0,
  };
}

/**
 * Valida a etapa "Revisão"
 * Modo: Manual e IA
 * 
 * Validações: Tudo que foi validado nas etapas anteriores + checklist de prontidão
 */
export function validateReviewStep(
  state: CampaignBuilderState,
  context: CampaignBuilderReviewContext,
): StepValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Executa validação de todas as etapas
  const configValidation = validateConfigurationStep(state, context);
  const audienceValidation = validateAudienceStep(state);
  const creativeValidation = validateCreativeStep(state);

  // Coleciona todos os erros
  errors.push(...configValidation.errors);
  errors.push(...audienceValidation.errors);
  errors.push(...creativeValidation.errors);

  // Avisos combinados
  warnings.push(...configValidation.warnings);
  warnings.push(...audienceValidation.warnings);
  warnings.push(...creativeValidation.warnings);

  // Avisos adicionais da revisão
  if (!state.placements.selected || state.placements.selected.length === 0) {
    warnings.push('Nenhum placement selecionado. Meta escolherá automaticamente.');
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
    case 'briefing-ia':
      return validateBriefingIaStep(state);
    case 'configuration':
      return validateConfigurationStep(state, context);
    case 'audience':
      return validateAudienceStep(state);
    case 'creative':
      return validateCreativeStep(state);
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
  'briefing-ia': {
    id: 'briefing-ia',
    label: 'Briefing IA',
    description: 'Descreva sua campanha em linguagem natural',
    order: 0,
    requiresAiMode: true,
  },
  'configuration': {
    id: 'configuration',
    label: 'Configuração',
    description: 'Nome, objetivo, conta e orçamento',
    order: 1,
  },
  'audience': {
    id: 'audience',
    label: 'Público',
    description: 'País, localização, idade e interesse',
    order: 2,
  },
  'creative': {
    id: 'creative',
    label: 'Criativo',
    description: 'Mensagem, headline, CTA e imagem',
    order: 3,
  },
  'review': {
    id: 'review',
    label: 'Revisão',
    description: 'Confirme antes de criar na Meta',
    order: 4,
  },
};

/**
 * Obtém a sequência de steps baseada no modo (manual ou IA)
 */
export function getStepSequence(isAiMode: boolean): StepId[] {
  if (isAiMode) {
    return ['briefing-ia', 'configuration', 'audience', 'creative', 'review'];
  }
  return ['configuration', 'audience', 'creative', 'review'];
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
