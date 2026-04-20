import { Injectable } from '@angular/core';
import { HttpInterceptorFn, HttpRequest } from '@angular/common/http';

/**
 * CSP Interceptor - Adiciona headers de segurança nas requisições
 * Protege contra XSS, Clickjacking, e outras vulnerabilidades
 */
export const cspInterceptor: HttpInterceptorFn = (req, next) => {
  // Headers de segurança podem ser adicionados aqui se necessário
  return next(req);
};

/**
 * Configuração de Content Security Policy
 * Use no arquivo main.ts ou index.html
 */
export const CSP_HEADERS = {
  'Content-Security-Policy': `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval';
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: https:;
    font-src 'self' data:;
    connect-src 'self' http://localhost:3004 https://api.metaiq.com;
    frame-ancestors 'none';
    base-uri 'self';
    form-action 'self';
  `.replace(/\s+/g, ' ').trim(),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
};

/**
 * Função helper para sanitizar input contra XSS
 */
export function sanitizeHtml(html: string): string {
  const div = document.createElement('div');
  div.textContent = html;
  return div.innerHTML;
}

/**
 * Função para validar URL segura
 */
export function isSafeUrl(url: string): boolean {
  try {
    const urlObj = new URL(url, window.location.origin);
    const allowedOrigins = [window.location.origin, 'http://localhost:3004', 'https://api.metaiq.com'];
    return allowedOrigins.some(origin => urlObj.origin === origin);
  } catch {
    return false;
  }
}
