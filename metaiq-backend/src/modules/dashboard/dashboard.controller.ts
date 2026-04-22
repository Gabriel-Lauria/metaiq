import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../common/interfaces';
import { DashboardService } from './dashboard.service';

class DashboardSummaryQueryDto {
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @IsOptional()
  days?: number;
}

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PLATFORM_ADMIN, Role.ADMIN, Role.MANAGER, Role.OPERATIONAL, Role.CLIENT)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardSummaryQueryDto,
  ) {
    return this.dashboardService.getSummary(user, {
      storeId: query.storeId,
      days: query.days ? Number(query.days) : undefined,
    });
  }
}
