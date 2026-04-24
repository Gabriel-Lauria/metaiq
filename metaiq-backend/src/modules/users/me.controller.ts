import {
  Body,
  Controller,
  Get,
  Patch,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditService } from '../../common/services/audit.service';
import { UpdateMyCompanyDto } from './company-profile.dto';
import { CompanyProfileResponseView, UsersService } from './users.service';

@Controller('me')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MeController {
  constructor(
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
  ) {}

  @Get('company')
  async getMyCompany(@Request() req: any): Promise<CompanyProfileResponseView> {
    return this.usersService.getMyCompanyForUser(req.user);
  }

  @Patch('company')
  async updateMyCompany(
    @Request() req: any,
    @Body() dto: UpdateMyCompanyDto,
  ): Promise<CompanyProfileResponseView> {
    const profile = await this.usersService.updateMyCompanyForUser(req.user, dto);
    this.auditService.record({
      action: 'company.self_update',
      status: 'success',
      actorId: req.user?.id,
      actorRole: req.user?.role,
      tenantId: req.user?.tenantId,
      targetType: 'tenant',
      targetId: req.user?.tenantId,
      requestId: req.requestId,
      metadata: { changedFields: Object.keys(dto) },
    });
    return profile;
  }
}
