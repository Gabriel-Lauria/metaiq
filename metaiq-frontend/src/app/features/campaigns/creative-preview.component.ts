import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CampaignDestinationType, CampaignPlacement } from './campaign-builder.types';
import { isLikelyDirectImageUrl, isSecureHttpUrl, isValidHttpUrl } from './creative-validation.util';

type CreativePreviewPlacement = 'facebook-feed' | 'instagram-feed' | 'instagram-story' | 'instagram-reels';
type CreativePreviewWarningTone = 'danger' | 'warning' | 'info';

interface CreativePreviewTab {
  id: CreativePreviewPlacement;
  label: string;
  subtitle: string;
  selected: boolean;
}

interface CreativePreviewWarning {
  tone: CreativePreviewWarningTone;
  title: string;
  detail: string;
}

@Component({
  selector: 'app-creative-preview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './creative-preview.component.html',
  styleUrls: ['./creative-preview.component.scss'],
})
export class CreativePreviewComponent implements OnChanges {
  @Input() pageName = '';
  @Input() displayName = '';
  @Input() message = '';
  @Input() headline = '';
  @Input() description = '';
  @Input() ctaLabel = 'Saiba mais';
  @Input() imageUrl = '';
  @Input() destinationUrl = '';
  @Input() objective = '';
  @Input() destinationType: CampaignDestinationType = 'site';
  @Input() ctaValue = 'LEARN_MORE';
  @Input() carousel = false;
  @Input() selectedPlacements: CampaignPlacement[] = [];
  @Input() interests = '';
  @Input() goals = '';

  activePlacement: CreativePreviewPlacement = 'facebook-feed';
  imageFailed = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['imageUrl']) {
      this.imageFailed = false;
    }

    const availableIds = new Set(this.previewTabs().map((item) => item.id));
    if (!availableIds.has(this.activePlacement)) {
      this.activePlacement = this.pickDefaultPlacement();
    }
  }

  previewTabs(): CreativePreviewTab[] {
    const tabs: CreativePreviewTab[] = [
      {
        id: 'facebook-feed',
        label: 'Facebook Feed',
        subtitle: 'Card com contexto de feed',
        selected: this.selectedPlacements.includes('feed'),
      },
      {
        id: 'instagram-feed',
        label: 'Instagram Feed',
        subtitle: 'Imagem central e legenda',
        selected: this.selectedPlacements.includes('feed'),
      },
      {
        id: 'instagram-story',
        label: 'Instagram Story',
        subtitle: 'Tela vertical com CTA destacado',
        selected: this.selectedPlacements.includes('stories'),
      },
    ];

    if (this.selectedPlacements.includes('reels')) {
      tabs.push({
        id: 'instagram-reels',
        label: 'Instagram Reels',
        subtitle: 'Formato extra com foco em vídeo curto',
        selected: true,
      });
    }

    return tabs;
  }

  setActivePlacement(placement: CreativePreviewPlacement): void {
    this.activePlacement = placement;
  }

  selectedPlacementLabel(): string {
    return this.previewTabs().find((item) => item.id === this.activePlacement)?.label || 'Facebook Feed';
  }

  placementWarnings(): CreativePreviewWarning[] {
    const warnings: CreativePreviewWarning[] = [];
    const messageLength = this.messagePreview().length;
    const headlineLength = this.headlinePreview().length;
    const descriptionLength = this.descriptionPreview().length;
    const isStoryLike = this.activePlacement === 'instagram-story' || this.activePlacement === 'instagram-reels';
    const lacksImage = !this.hasImage();
    const selectedInPlan = this.previewTabs().find((item) => item.id === this.activePlacement)?.selected;

    if (lacksImage) {
      warnings.push({
        tone: 'danger',
        title: 'Criativo sem imagem',
        detail: 'Use uma arte para deixar a prévia mais crível e revisar melhor o impacto visual.',
      });
    }

    if (this.imageUrl.trim() && !isValidHttpUrl(this.imageUrl)) {
      warnings.push({
        tone: 'danger',
        title: 'URL da imagem inválida',
        detail: 'A imagem precisa começar com http:// ou https:// para montar o creative com segurança.',
      });
    } else if (this.imageUrl.trim() && !isLikelyDirectImageUrl(this.imageUrl)) {
      warnings.push({
        tone: 'warning',
        title: 'Imagem parece não ser direta',
        detail: 'Evite links de preview, busca ou redirecionamento. Prefira a URL final do arquivo de imagem.',
      });
    }

    if (this.destinationType === 'site' && !this.destinationUrl.trim()) {
      warnings.push({
        tone: 'danger',
        title: 'Destino de site ainda ausente',
        detail: 'O creative precisa de uma URL de destino válida antes do envio para a Meta.',
      });
    } else if (this.destinationType === 'site' && !isValidHttpUrl(this.destinationUrl)) {
      warnings.push({
        tone: 'danger',
        title: 'URL de destino inválida',
        detail: 'Use uma URL absoluta começando com http:// ou https://.',
      });
    } else if (this.destinationType === 'site' && !isSecureHttpUrl(this.destinationUrl)) {
      warnings.push({
        tone: 'info',
        title: 'HTTPS recomendado',
        detail: 'Links seguros tendem a passar mais confiança e ajudam a evitar rejeições desnecessárias.',
      });
    }

    if (isStoryLike && messageLength > 110) {
      warnings.push({
        tone: 'warning',
        title: 'Texto longo para visualização vertical',
        detail: 'Stories e Reels tendem a pedir mensagem mais curta e leitura mais imediata.',
      });
    } else if (!isStoryLike && messageLength > 220) {
      warnings.push({
        tone: 'info',
        title: 'Texto principal extenso',
        detail: 'No feed ainda funciona, mas pode perder clareza no primeiro olhar.',
      });
    }

    if ((isStoryLike && headlineLength > 34) || (!isStoryLike && headlineLength > 45)) {
      warnings.push({
        tone: 'warning',
        title: 'Headline longa',
        detail: 'Vale reduzir para manter hierarquia e leitura rápida no placement atual.',
      });
    }

    if (isStoryLike && descriptionLength > 70) {
      warnings.push({
        tone: 'info',
        title: 'Descrição pode sobrar no story',
        detail: 'No formato vertical o destaque costuma ficar na imagem, mensagem e CTA.',
      });
    }

    if (isStoryLike && this.hasImage() && this.shouldWarnAboutVerticalAsset()) {
      warnings.push({
        tone: 'info',
        title: 'Imagem pode não estar ideal para vertical',
        detail: 'Stories e Reels costumam render melhor com arte 9:16 ou composição pensada para tela cheia.',
      });
    }

    if (this.isCtaPotentiallyMisaligned()) {
      warnings.push({
        tone: 'info',
        title: 'CTA pode não combinar com o objetivo',
        detail: 'Revise se a chamada escolhida reforça o resultado esperado desta campanha.',
      });
    }

    if (!this.message.trim() && !this.headline.trim()) {
      warnings.push({
        tone: 'warning',
        title: 'Copy ainda genérica',
        detail: 'Sem texto principal e headline definidos, a revisão de clareza fica limitada.',
      });
    }

    if (this.carousel) {
      warnings.push({
        tone: 'warning',
        title: 'Carousel ainda não vai para a Meta',
        detail: 'A opção segue útil para planejamento, mas o payload real continua sendo um creative simples.',
      });
    }

    if (this.ctaValue.trim()) {
      warnings.push({
        tone: 'info',
        title: 'CTA técnico pronto para envio',
        detail: `O botão será enviado no formato compatível com a Meta: ${this.ctaValue.trim()}.`,
      });
    }

    if (!selectedInPlan) {
      warnings.push({
        tone: 'info',
        title: 'Placement extra para revisão',
        detail: 'Esta visualização ajuda a revisar o criativo, mesmo que o placement não esteja marcado no plano atual.',
      });
    }

    return warnings.slice(0, 5);
  }

  goalsList(): string[] {
    return this.parseList(this.goals);
  }

  interestsList(): string[] {
    return this.parseList(this.interests);
  }

  identityName(): string {
    return this.displayName.trim() || this.pageName.trim() || 'Sua página';
  }

  identityHandle(): string {
    const base = this.identityName()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '');
    return base ? `@${base.slice(0, 18)}` : '@sua_pagina';
  }

  messagePreview(): string {
    return this.message.trim() || 'A mensagem principal do anúncio aparece aqui para revisão visual.';
  }

  headlinePreview(): string {
    return this.headline.trim() || 'Headline do anúncio';
  }

  descriptionPreview(): string {
    if (this.description.trim()) return this.description.trim();
    if (this.message.trim()) return `${this.message.trim().slice(0, 92)}${this.message.trim().length > 92 ? '…' : ''}`;
    return 'Descrição complementar do anúncio.';
  }

  websiteHost(): string {
    try {
      return new URL(this.destinationUrl.trim()).hostname.replace(/^www\./i, '');
    } catch {
      return 'seudominio.com';
    }
  }

  siteLabel(): string {
    return this.destinationUrl.trim() || 'Destino de site ainda não informado';
  }

  avatarLetter(): string {
    return this.identityName().charAt(0).toUpperCase() || 'M';
  }

  hasImage(): boolean {
    return !!this.imageUrl.trim() && !this.imageFailed;
  }

  previewPlaceholderMessage(): string {
    return this.imageUrl.trim()
      ? 'Não foi possível carregar esta imagem agora'
      : 'Adicione uma imagem para enxergar melhor o peso visual do anúncio';
  }

  onPreviewImageError(): void {
    this.imageFailed = true;
  }

  warningToneClass(tone: CreativePreviewWarningTone): string {
    return `tone-${tone}`;
  }

  private pickDefaultPlacement(): CreativePreviewPlacement {
    if (this.selectedPlacements.includes('stories')) return 'instagram-story';
    if (this.selectedPlacements.includes('reels')) return 'instagram-reels';
    if (this.selectedPlacements.includes('feed')) return 'facebook-feed';
    return 'facebook-feed';
  }

  private parseList(value: string): string[] {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 4);
  }

  private shouldWarnAboutVerticalAsset(): boolean {
    const normalized = this.imageUrl.toLowerCase();

    if (/(vertical|portrait|story|stories|reel|9x16|1080x1920)/i.test(normalized)) {
      return false;
    }

    return /(square|1x1|feed|landscape|banner|1200x628|16x9|4x5)/i.test(normalized);
  }

  private isCtaPotentiallyMisaligned(): boolean {
    const cta = this.ctaLabel.toLowerCase();
    const objective = this.objective.toUpperCase();

    if (objective === 'REACH' && /(comprar|agendar|cadastrar|baixar)/i.test(cta)) {
      return true;
    }

    if (objective === 'OUTCOME_LEADS' && /(saiba mais|ver oferta)/i.test(cta)) {
      return true;
    }

    return false;
  }
}
