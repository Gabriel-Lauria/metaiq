import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { UiBadgeComponent } from '../../core/components/ui-badge.component';
import { Role, StoreIntegration, IntegrationStatus, AdAccount, Asset } from '../../core/models';
import { AccountContextService } from '../../core/services/account-context.service';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { StoreContextService } from '../../core/services/store-context.service';
import { UiService } from '../../core/services/ui.service';

type WelcomeStepId =
  | 'connect-meta'
  | 'configure-page'
  | 'register-store'
  | 'upload-assets'
  | 'create-campaign';

interface WelcomeStep {
  id: WelcomeStepId;
  title: string;
  description: string;
  done: boolean;
  actionLabel: string;
}

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [CommonModule, UiBadgeComponent],
  templateUrl: './welcome.component.html',
  styleUrls: ['./welcome.component.scss'],
})
export class WelcomeComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly ui = inject(UiService);
  private readonly destroyRef = inject(DestroyRef);
  readonly accountContext = inject(AccountContextService);
  readonly storeContext = inject(StoreContextService);

  loading = signal(true);
  saving = signal(false);
  error = signal<string | null>(null);
  integration = signal<StoreIntegration | null>(null);
  adAccounts = signal<AdAccount[]>([]);
  assets = signal<Asset[]>([]);
  campaignCount = signal(0);

  readonly currentUser = computed(() => this.auth.getCurrentUser());
  readonly currentStore = computed(() => this.storeContext.selectedStore());
  readonly selectedStoreId = computed(() => this.storeContext.getValidSelectedStoreId());
  readonly isIndividual = computed(() => this.accountContext.isIndividualAccount());
  readonly hasStore = computed(() => !!this.selectedStoreId());
  readonly canManageIntegrations = computed(() =>
    this.auth.hasAnyRole([Role.PLATFORM_ADMIN, Role.ADMIN, Role.OPERATIONAL]),
  );
  readonly steps = computed<WelcomeStep[]>(() => [
    {
      id: 'connect-meta',
      title: 'Conectar conta Meta',
      description: 'Ative a integração oficial para publicar, sincronizar contas e operar com segurança.',
      done: this.integration()?.status === IntegrationStatus.CONNECTED,
      actionLabel: 'Conectar Meta',
    },
    {
      id: 'configure-page',
      title: 'Configurar página e rastreamento',
      description: 'Selecione a página principal agora e finalize pixel e rastreamento no builder quando a campanha exigir.',
      done: !!this.integration()?.pageId,
      actionLabel: 'Configurar conta',
    },
    {
      id: 'register-store',
      title: 'Confirmar escopo da operação',
      description: this.isIndividual()
        ? 'Sua empresa já nasce com escopo dedicado. Revise dados e mantenha a base pronta para operar.'
        : 'Selecione a store correta antes de publicar para garantir escopo, ativos e métricas no lugar certo.',
      done: this.hasStore(),
      actionLabel: 'Configurar conta',
    },
    {
      id: 'upload-assets',
      title: 'Enviar seus assets',
      description: 'Suba criativos e imagens antes da publicação para reduzir retrabalho e falhas operacionais.',
      done: this.assets().length > 0,
      actionLabel: 'Criar primeira campanha',
    },
    {
      id: 'create-campaign',
      title: 'Criar sua primeira campanha',
      description: 'Chegue ao builder com loja, integração e ativos prontos para publicar com mais confiança.',
      done: this.campaignCount() > 0,
      actionLabel: 'Criar primeira campanha',
    },
  ]);
  readonly completedSteps = computed(() => this.steps().filter((step) => step.done).length);
  readonly progressPercent = computed(() => Math.round((this.completedSteps() / this.steps().length) * 100));
  readonly nextPriority = computed(() => this.steps().find((step) => !step.done) ?? null);
  readonly onboardingSummary = computed(() => {
    if (this.completedSteps() === this.steps().length) {
      return 'Seu ambiente já está estruturado para operar com dashboard, campanhas e ativos no fluxo correto.';
    }

    const next = this.nextPriority();
    return next
      ? `Próxima prioridade: ${next.title.toLowerCase()}.`
      : 'Seu ambiente está evoluindo bem. Continue a preparação antes de escalar investimento.';
  });

  constructor() {
    effect(() => {
      if (!this.auth.isAuthenticated()) {
        return;
      }

      if (!this.currentUser()?.firstLogin) {
        queueMicrotask(() => this.router.navigate(['/dashboard']));
        return;
      }

      this.storeContext.load();
      if (!this.storeContext.loaded()) {
        return;
      }

      this.loadContext();
    });
  }

  completeOnboardingAndOpenDashboard(): void {
    this.saving.set(true);
    this.api.updateMyOnboarding(true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => {
          this.auth.updateCurrentUserContext({
            onboardingCompletedAt: user.onboardingCompletedAt ?? new Date(),
            firstLogin: false,
          });
          this.saving.set(false);
          this.ui.showSuccess('Ambiente pronto', 'Seu dashboard agora passa a ser a entrada principal da operação.');
          this.router.navigate(['/dashboard']);
        },
        error: (err) => {
          this.saving.set(false);
          this.ui.showError('Não foi possível concluir o onboarding', err?.message || 'Tente novamente.');
        },
      });
  }

  openIntegrations(): void {
    this.router.navigate(['/manager/integrations'], {
      queryParams: this.selectedStoreId() ? { storeId: this.selectedStoreId() } : undefined,
    });
  }

  openCampaignBuilder(): void {
    this.router.navigate(['/campaigns'], {
      queryParams: {
        openCreate: 1,
        createMode: 'manual',
        ...(this.selectedStoreId() ? { storeId: this.selectedStoreId() } : {}),
      },
    });
  }

  configureAccount(): void {
    if (this.isIndividual()) {
      this.router.navigate(['/my-company']);
      return;
    }

    this.router.navigate(['/manager/stores']);
  }

  runStep(step: WelcomeStep): void {
    if (step.id === 'connect-meta' || step.id === 'configure-page') {
      this.openIntegrations();
      return;
    }

    if (step.id === 'register-store') {
      this.configureAccount();
      return;
    }

    this.openCampaignBuilder();
  }

  stepTone(done: boolean): 'success' | 'warning' {
    return done ? 'success' : 'warning';
  }

  stepStatus(done: boolean): string {
    return done ? 'Concluído' : 'Pendente';
  }

  trackByStep(_: number, step: WelcomeStep): string {
    return step.id;
  }

  private loadContext(): void {
    const storeId = this.selectedStoreId();
    if (!storeId) {
      this.loading.set(false);
      this.integration.set(null);
      this.adAccounts.set([]);
      this.assets.set([]);
      this.campaignCount.set(0);
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    forkJoin({
      integration: this.api.getMetaIntegrationStatus(storeId).pipe(catchError(() => of(null))),
      adAccounts: this.api.getAdAccounts(storeId).pipe(catchError(() => of([]))),
      assets: this.api.getAssets(storeId, 'image').pipe(catchError(() => of([]))),
      campaigns: this.api.getCampaigns({ page: 1, limit: 1 }, storeId).pipe(catchError(() => of({
        data: [],
        meta: { total: 0, page: 1, limit: 1, totalPages: 1, hasNext: false, hasPrev: false },
      }))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ integration, adAccounts, assets, campaigns }) => {
          this.integration.set(integration);
          this.adAccounts.set(adAccounts);
          this.assets.set(assets);
          this.campaignCount.set(campaigns.meta.total);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err?.message || 'Não foi possível carregar o onboarding agora.');
          this.loading.set(false);
        },
      });
  }
}
