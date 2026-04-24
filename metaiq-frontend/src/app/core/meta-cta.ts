/**
 * Shared CTA definitions for the Meta campaign builder.
 * The UI should display `label`, while integrations must use `value`.
 */

export const META_CTA_VALUES = [
  'LEARN_MORE',
  'SHOP_NOW',
  'CONTACT_US',
  'BOOK_NOW',
  'SIGN_UP',
  'DOWNLOAD',
  'GET_OFFER',
  'MESSAGE_PAGE',
  'OPEN_APP',
  'INSTALL_APP',
  'APPLY_NOW',
] as const;

export type MetaCallToActionType = (typeof META_CTA_VALUES)[number];

export interface CtaOption {
  label: string;
  value: MetaCallToActionType;
  hint?: string;
}

export const CTA_OPTIONS: CtaOption[] = [
  {
    label: 'Saiba mais',
    value: 'LEARN_MORE',
    hint: 'Direciona para mais informações',
  },
  {
    label: 'Comprar agora',
    value: 'SHOP_NOW',
    hint: 'Ação direto para compra',
  },
  {
    label: 'Fale conosco',
    value: 'CONTACT_US',
    hint: 'Abre formulário de contato',
  },
  {
    label: 'Agendar agora',
    value: 'BOOK_NOW',
    hint: 'Para agendar consulta ou serviço',
  },
  {
    label: 'Cadastrar',
    value: 'SIGN_UP',
    hint: 'Inscrição em newsletter ou programa',
  },
  {
    label: 'Baixar',
    value: 'DOWNLOAD',
    hint: 'Download de conteúdo ou app',
  },
  {
    label: 'Ver oferta',
    value: 'GET_OFFER',
    hint: 'Apresenta promoção especial',
  },
  {
    label: 'Enviar mensagem',
    value: 'MESSAGE_PAGE',
    hint: 'Abre conversa via Messenger',
  },
];

export const DEFAULT_CTA: MetaCallToActionType = 'LEARN_MORE';

const CTA_VALUE_SET = new Set<MetaCallToActionType>(META_CTA_VALUES);
const CTA_LABEL_ALIASES: Record<string, MetaCallToActionType> = {
  SAIBA_MAIS: 'LEARN_MORE',
  COMPRAR_AGORA: 'SHOP_NOW',
  FALE_CONOSCO: 'CONTACT_US',
  AGENDAR_AGORA: 'BOOK_NOW',
  CADASTRAR: 'SIGN_UP',
  CADASTRE_SE: 'SIGN_UP',
  INSCREVA_SE: 'SIGN_UP',
  BAIXAR: 'DOWNLOAD',
  VER_OFERTA: 'GET_OFFER',
  ENVIAR_MENSAGEM: 'MESSAGE_PAGE',
  ABRIR_APP: 'OPEN_APP',
  INSTALAR_APP: 'INSTALL_APP',
  CANDIDATAR_SE: 'APPLY_NOW',
  APLICAR_AGORA: 'APPLY_NOW',
};

function normalizeCtaKey(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

export function parseCtaValue(value: string | null | undefined): MetaCallToActionType | undefined {
  if (!value) return undefined;

  const normalizedKey = normalizeCtaKey(value);
  if (!normalizedKey) return undefined;

  if (CTA_VALUE_SET.has(normalizedKey as MetaCallToActionType)) {
    return normalizedKey as MetaCallToActionType;
  }

  return CTA_LABEL_ALIASES[normalizedKey];
}

export function isValidCtaValue(cta: string | undefined): cta is MetaCallToActionType {
  return !!parseCtaValue(cta);
}

export function getCtaLabelByValue(value: MetaCallToActionType | string | undefined): string {
  const normalized = parseCtaValue(value);
  const option = CTA_OPTIONS.find((item) => item.value === normalized);
  return option?.label || CTA_OPTIONS[0].label;
}

export function getCtaValueByLabel(label: string | undefined): MetaCallToActionType | undefined {
  return parseCtaValue(label);
}

export function normalizeCtaValue(
  value: string | null | undefined,
  fallback: MetaCallToActionType = DEFAULT_CTA,
): MetaCallToActionType {
  return parseCtaValue(value) || fallback;
}
