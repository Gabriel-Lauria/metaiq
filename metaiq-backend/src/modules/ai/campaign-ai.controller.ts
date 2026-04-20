import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { CampaignAiService, CampaignAiSuggestionResponse } from './campaign-ai.service';
import { CampaignAiSuggestDto } from './dto/campaign-ai.dto';

@Controller('campaign-ai')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER, Role.OPERATIONAL, Role.CLIENT)
export class CampaignAiController {
  constructor(private readonly campaignAiService: CampaignAiService) {}

  @Post('suggest')
  async suggest(@Body() body: CampaignAiSuggestDto): Promise<CampaignAiSuggestionResponse> {
    return this.campaignAiService.suggestCampaign(body.prompt.trim());
  }
}
