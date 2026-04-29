import { inject } from '@angular/core';
import {
  HttpInterceptorFn,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { UiService } from './services/ui.service';
import { addBreadcrumb, captureException, captureMessage } from './monitoring/sentry.config';

interface BackendErrorBody {
  statusCode?: number;
  message?: string | string[] | Record<string, unknown>;
  error?: string;
  step?: string;
  executionId?: string;
  executionStatus?: string;
  partialIds?: Record<string, unknown>;
  metaError?: Record<string, unknown>;
  currentStep?: string;
  canRetry?: boolean;
  retryCount?: number;
  userMessage?: string;
  stepState?: Record<string, unknown>;
  hint?: string;
  [key: string]: unknown;
}

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const uiService = inject(UiService);
  addBreadcrumb(`HTTP ${req.method} ${req.url}`, 'http', 'info');

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      let userFriendlyMessage = 'Erro inesperado. Tente novamente.';
      let shouldShowNotification = true;
      let backendError: BackendErrorBody | null = null;

      // Adaptar para o novo formato de erro do backend: { statusCode, message, error }
      if (error.error && typeof error.error === 'object') {
        backendError = error.error as BackendErrorBody;

        const statusCode = backendError.statusCode ?? error.status;
        const backendMessage = extractBackendMessage(backendError);

        if (backendMessage) {
          userFriendlyMessage = getUserFriendlyMessage(statusCode, backendMessage);
        }
      }

      if (error.status === 401) {
        userFriendlyMessage = getUnauthorizedMessage(req.url);
        shouldShowNotification = false;
      } else if (error.status === 403) {
        userFriendlyMessage = 'Acesso negado. Você não tem permissão para acessar este recurso.';
        if (shouldShowNotification) {
          uiService.showWarning('Acesso negado', userFriendlyMessage);
          shouldShowNotification = false;
        }
      } else if (error.status === 404) {
        userFriendlyMessage = 'Recurso inexistente ou não encontrado.';
        shouldShowNotification = false;
      } else if (error.status === 429) {
        // Rate limiting - NÃO fazer retry automático
        userFriendlyMessage = 'Muitas tentativas. Aguarde alguns segundos.';
        uiService.setRateLimit();
        if (shouldShowNotification) {
          uiService.showWarning('Limite de tentativas excedido', userFriendlyMessage);
          shouldShowNotification = false;
        }
      } else if (error.status === 500) {
        // Erro interno do servidor
        userFriendlyMessage = 'Erro interno. Tente novamente.';
        captureException(new Error(`API 500 em ${req.url}`), {
          status: error.status,
          url: req.url,
          backendError,
        });
        if (shouldShowNotification) {
          uiService.showError('Erro do servidor', userFriendlyMessage);
          shouldShowNotification = false;
        }
      } else if (error.status === 0) {
        // Conexão falhou
        userFriendlyMessage = 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.';
        captureMessage(`Servidor indisponível em ${req.url}`, 'error');
        if (shouldShowNotification) {
          uiService.showError('Servidor indisponível', userFriendlyMessage);
          shouldShowNotification = false;
        }
      } else if (error.status === 502 || error.status === 503 || error.status === 504) {
        captureException(new Error(`Falha operacional em ${req.url}`), {
          status: error.status,
          url: req.url,
          backendError,
        });
      }

      // Retornar erro padronizado
      return throwError(() => ({
        status: error.status,
        message: userFriendlyMessage,
        error: backendError ?? error.error,
        step: backendError?.step,
        executionId: backendError?.executionId,
        executionStatus: backendError?.executionStatus,
        partialIds: backendError?.partialIds,
        metaError: backendError?.metaError,
        currentStep: backendError?.currentStep,
        canRetry: backendError?.canRetry,
        retryCount: backendError?.retryCount,
        userMessage: typeof backendError?.userMessage === 'string' ? backendError.userMessage : undefined,
        stepState: backendError?.stepState,
        hint: typeof backendError?.hint === 'string' ? backendError.hint : undefined,
        details: backendError,
        originalError: error
      }));
    })
  );
};

function getUserFriendlyMessage(status: number, backendMessage: string): string {
  // Mapeamento de mensagens técnicas para mensagens amigáveis
  const messageMap: { [key: string]: string } = {
    'Invalid credentials': 'Email ou senha incorretos.',
    'Credenciais inválidas': 'Email ou senha incorretos.',
    'User not found': 'Usuário não encontrado.',
    'Email already exists': 'Este email já está cadastrado.',
    'Token expired': 'Sessão expirada. Faça login novamente.',
    'Invalid token': 'Token inválido. Faça login novamente.',
    'Access denied': 'Acesso negado.',
    'Validation failed': 'Dados inválidos. Verifique os campos.',
    'Rate limit exceeded': 'Muitas tentativas. Aguarde alguns segundos.',
  };

  // Procurar por mensagens conhecidas
  for (const [technical, friendly] of Object.entries(messageMap)) {
    if (backendMessage.toLowerCase().includes(technical.toLowerCase())) {
      return friendly;
    }
  }

  if (backendMessage.trim()) {
    return backendMessage;
  }

  // Fallback baseado no status HTTP
  switch (status) {
    case 400:
      return 'Dados inválidos. Verifique as informações e tente novamente.';
    case 401:
      return 'Sessão expirada. Faça login novamente.';
    case 403:
      return 'Acesso negado. Você não tem permissão para esta ação.';
    case 404:
      return 'Recurso não encontrado.';
    case 422:
      return 'Dados inválidos. Verifique os campos obrigatórios.';
    default:
      return 'Erro inesperado. Tente novamente.';
  }
}

function extractBackendMessage(error: BackendErrorBody): string {
  const message = error.message;
  if (typeof message === 'string') {
    return message;
  }

  if (Array.isArray(message)) {
    return message.filter(Boolean).join(' ');
  }

  if (message && typeof message === 'object') {
    const nestedMessage = (message as BackendErrorBody).message;
    if (typeof nestedMessage === 'string') {
      return nestedMessage;
    }
    if (Array.isArray(nestedMessage)) {
      return nestedMessage.filter(Boolean).join(' ');
    }
  }

  return typeof error.error === 'string' ? error.error : '';
}

function getUnauthorizedMessage(url: string): string {
  if (url.includes('/auth/login')) {
    return 'Email ou senha incorretos.';
  }

  if (url.includes('/auth/register')) {
    return 'Não foi possível criar a conta. Verifique os dados e tente novamente.';
  }

  return 'Sessão expirada. Faça login novamente.';
}
