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
  readonly featureCards = [
    {
      title: 'Criar campanhas com IA',
      description: 'Receba apoio para estruturar a campanha, o objetivo e a mensagem sem depender de conhecimento técnico.',
    },
    {
      title: 'Revisar antes de publicar',
      description: 'Veja os principais pontos da campanha antes de enviar para a Meta e ajuste com mais segurança.',
    },
    {
      title: 'Conectar sua conta Meta',
      description: 'Conecte Facebook e Instagram em poucos passos para começar a publicar suas campanhas.',
    },
    {
      title: 'Modo beta',
      description: 'MetaIQ está em versão beta. Algumas funcionalidades ainda estão em evolução.',
    },
  ];

  ngOnInit(): void {
    if (!this.authService.isAuthenticated()) {
      return;
    }

    const user = this.authService.getCurrentUser();
    queueMicrotask(() => {
      this.router.navigate([user?.accountType === 'INDIVIDUAL' ? '/campaigns' : '/dashboard']);
    });
  }
}
