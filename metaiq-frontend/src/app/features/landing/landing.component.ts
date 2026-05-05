import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../core/environment';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss'],
})
export class LandingComponent implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);

  readonly enablePublicRegister = environment.enablePublicRegister;
  readonly primaryCtaLabel = this.enablePublicRegister ? 'Começar agora' : 'Acessar plataforma';
  readonly primaryCtaRoute = this.enablePublicRegister ? '/register' : '/auth';
  readonly secondaryCtaLabel = this.enablePublicRegister ? 'Ver demonstração' : 'Ir para login';
  readonly trustPills = [
    'Estrutura multi-tenant pronta para operação real',
    'Fluxo com rastreabilidade e revisão antes da publicação',
    'Integração Meta conectada ao contexto da operação',
  ];
  readonly heroStats = [
    { value: '1 central', label: 'para campanhas, métricas e decisões' },
    { value: 'Menos retrabalho', label: 'para equipes de tráfego, agências e operações menores' },
    { value: 'Mais previsibilidade', label: 'para decidir onde escalar e onde corrigir rota' },
  ];
  readonly painPoints = [
    'Campanhas desorganizadas entre contas, pessoas e planilhas paralelas.',
    'Métricas espalhadas que atrasam a leitura de performance e o ajuste de rota.',
    'Decisões no escuro porque criação, publicação e acompanhamento não conversam entre si.',
    'Falta de padrão operacional para lojas, clientes e equipes em crescimento.',
  ];
  readonly solutionCards = [
    {
      title: 'Criação inteligente de campanhas',
      description: 'Organize briefing, configuração, ativos e publicação em um fluxo que protege verba antes de subir o anúncio.',
    },
    {
      title: 'Centralização de métricas e alertas',
      description: 'Enxergue spend, ROAS, CPA, CTR e campanhas críticas em uma central executiva pronta para decisão.',
    },
    {
      title: 'Controle por store e operação',
      description: 'Mantenha escopo, contexto e responsabilidade claros em estruturas multiusuário e multi-loja.',
    },
    {
      title: 'Integração Meta preparada para uso real',
      description: 'Conecte a conta certa, publique com mais segurança e reduza falhas típicas de fluxos improvisados.',
    },
  ];
  readonly benefits = [
    'Menos retrabalho entre briefing, criativo, setup e publicação.',
    'Mais previsibilidade para investimento, pacing e leitura de eficiência.',
    'Decisões mais rápidas com contexto executivo e alertas de prioridade.',
    'Melhor ROAS potencial com operação mais organizada e menos ruído.',
    'Controle total do que cada store, usuário e campanha está fazendo.',
  ];
  readonly useCases = [
    {
      title: 'Para pequenas empresas',
      description: 'Ganhe estrutura para anunciar com mais segurança mesmo sem um time interno grande de mídia.',
    },
    {
      title: 'Para agências',
      description: 'Padronize execução, reduza ruído operacional e dê mais visibilidade para cada cliente ou store atendida.',
    },
    {
      title: 'Para consultorias e gestores de tráfego',
      description: 'Centralize contas, contexto, assets e performance sem depender de planilhas e repasses manuais.',
    },
  ];
  readonly trustSignals = [
    'Preparado para operação multi-tenant com escopo por usuário e loja.',
    'Segurança, rastreabilidade e observabilidade para fluxos críticos.',
    'Automação operacional conectada ao contexto real da conta Meta.',
  ];

  ngOnInit(): void {
    if (!this.authService.isAuthenticated()) {
      return;
    }

    queueMicrotask(() => {
      this.router.navigateByUrl(this.authService.resolveAuthenticatedRoute());
    });
  }
}
