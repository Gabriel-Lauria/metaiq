import { Body, Controller, GoneException, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums';
import { AuthenticatedUser } from '../../common/interfaces';
import {
  CampaignAnalysisResponse,
  CampaignAiService,
  CampaignSuggestionResponse,
} from './campaign-ai.service';
import { CampaignAnalysisDto, CampaignSuggestionDto } from './dto/campaign-ai.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER, Role.OPERATIONAL)
export class CampaignAiController {
  constructor(private readonly campaignAiService: CampaignAiService) {}

  @Post('campaign-ai/suggest')
  async suggest(): Promise<never> {
    throw new GoneException(
      'Endpoint legado desativado. Use POST /ai/campaign-suggestions com storeId para sugestões contextualizadas.',
    );
  }

  @Post('ai/campaign-suggestions')
  async campaignSuggestions(
    @Body() body: CampaignSuggestionDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<CampaignSuggestionResponse> {
    return this.campaignAiService.suggestCampaignFormFields({
      prompt: body.prompt.trim(),
      storeId: body.storeId.trim(),
      requestId: req.requestId,
      goal: body.goal,
      funnelStage: body.funnelStage,
      budget: body.budget,
      durationDays: body.durationDays,
      primaryOffer: body.primaryOffer,
      destinationType: body.destinationType,
      region: body.region,
      extraContext: body.extraContext,
    }, user);
  }

  @Post('ai/campaign-analysis')
  async campaignAnalysis(
    @Body() body: CampaignAnalysisDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<CampaignAnalysisResponse> {
    return this.campaignAiService.analyzeCampaign({
      storeId: body.storeId.trim(),
      requestId: req.requestId,
      campaign: body.campaign,
      adSet: body.adSet,
      creative: body.creative,
      targeting: body.targeting,
      budget: body.budget,
      location: body.location,
      objective: body.objective?.trim(),
      cta: body.cta?.trim(),
      destinationUrl: body.destinationUrl?.trim(),
    }, user);
  }
}
