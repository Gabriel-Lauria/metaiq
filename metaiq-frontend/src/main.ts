import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { APP_INITIALIZER, LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { routes } from './app/app.routes';
import { jwtInterceptor } from './app/core/jwt.interceptor';
import { errorInterceptor } from './app/core/error.interceptor';
import { cspInterceptor } from './app/core/security/csp.interceptor';
import { ThemeService } from './app/core/theme/theme.service';
import { initSentry } from './app/core/monitoring/sentry.config';
import { AnalyticsService } from './app/core/services/analytics.service';
import { AuthService } from './app/core/services/auth.service';

// Inicializar tema antes de carregar a aplicação
ThemeService.initialize();

// Inicializar Sentry para error tracking
initSentry();

registerLocaleData(localePt);

bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(
      withInterceptors([cspInterceptor, errorInterceptor, jwtInterceptor])
    ),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: (authService: AuthService) => () =>
        firstValueFrom(authService.initializeSession()),
      deps: [AuthService],
    },
    // Inicializar analytics
    {
      provide: 'ANALYTICS_INIT',
      useFactory: (analytics: AnalyticsService) => {
        analytics.initialize();
        return true;
      },
      deps: [AnalyticsService]
    }
  ],
}).catch(err => console.error(err));
