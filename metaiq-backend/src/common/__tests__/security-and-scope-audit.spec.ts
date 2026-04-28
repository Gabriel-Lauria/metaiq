import { GUARDS_METADATA } from '@nestjs/common/constants';
import * as fs from 'fs';
import * as path from 'path';
import { AppController } from '../../app.controller';
import { ObservabilityController } from '../controllers/observability.controller';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { AdAccountsController } from '../../modules/ad-accounts/ad-accounts.controller';
import { CampaignAiController } from '../../modules/ai/campaign-ai.controller';
import { AuthController } from '../../modules/auth/auth.controller';
import { CampaignsController } from '../../modules/campaigns/campaigns.controller';
import { DashboardController } from '../../modules/dashboard/dashboard.controller';
import { IbgeController } from '../../modules/ibge/ibge.controller';
import {
  MetaCampaignCreationAuditController,
  MetaIntegrationController,
  MetaOAuthCallbackController,
} from '../../modules/integrations/meta/meta.controller';
import { MetaCampaignRecoveryController } from '../../modules/integrations/meta/meta-campaign-recovery.controller';
import { InsightsController } from '../../modules/insights/insights.controller';
import { ManagersController } from '../../modules/managers/managers.controller';
import { MetricsController } from '../../modules/metrics/metrics.controller';
import { StoresController } from '../../modules/stores/stores.controller';
import { MeController } from '../../modules/users/me.controller';
import { UsersController } from '../../modules/users/users.controller';

const auditedGuardedControllers = {
  AdAccountsController,
  CampaignAiController,
  CampaignsController,
  DashboardController,
  InsightsController,
  ManagersController,
  MeController,
  MetaCampaignCreationAuditController,
  MetaCampaignRecoveryController,
  MetaIntegrationController,
  MetricsController,
  ObservabilityController,
  StoresController,
  UsersController,
};

const allowedPublicOrSystemControllers = {
  AppController,
  AuthController,
  IbgeController,
  MetaOAuthCallbackController,
};

function readControllerNames(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const names: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      names.push(...readControllerNames(fullPath));
      continue;
    }

    if (!entry.name.endsWith('.controller.ts') || entry.name.endsWith('.spec.ts')) {
      continue;
    }

    const source = fs.readFileSync(fullPath, 'utf-8');
    const matches = source.matchAll(/export class (\w+Controller)/g);
    for (const match of matches) {
      names.push(match[1]);
    }
  }

  return names;
}

function expectClassGuards(controllerClass: Function, expectedGuards: Function[]): void {
  const guards = Reflect.getMetadata(GUARDS_METADATA, controllerClass) ?? [];
  const actualNames = guards.map((guard: Function) => guard?.name);

  expect(actualNames).toEqual(expect.arrayContaining(expectedGuards.map((guard) => guard.name)));
}

describe('Security and scope audit', () => {
  const srcRoot = path.resolve(__dirname, '..', '..');
  const discoveredControllers = readControllerNames(srcRoot).sort();
  const auditedControllers = [
    ...Object.keys(auditedGuardedControllers),
    ...Object.keys(allowedPublicOrSystemControllers),
  ].sort();

  it('keeps the controller inventory explicitly audited', () => {
    expect(discoveredControllers).toEqual(auditedControllers);
  });

  it.each(Object.entries(auditedGuardedControllers))(
    '%s keeps class-level JwtAuthGuard and RolesGuard',
    (_controllerName, controllerClass) => {
      expectClassGuards(controllerClass, [JwtAuthGuard, RolesGuard]);
    },
  );

  it('keeps the sample protected endpoint behind JwtAuthGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AppController.prototype.protected) ?? [];
    expect(guards.map((guard: Function) => guard?.name)).toContain(JwtAuthGuard.name);
  });

  it('keeps tenant/store scope enforcement wired into sensitive services', () => {
    const sourceChecks: Array<{ file: string; snippets: string[] }> = [
      {
        file: 'modules/ad-accounts/ad-accounts.service.ts',
        snippets: ['validateStoreAccess', 'validateAdAccountAccess', 'applyAdAccountScope'],
      },
      {
        file: 'modules/ai/campaign-ai.service.ts',
        snippets: ['validateStoreScopeIfPossible', 'validateStoreAccess(requester, storeId)'],
      },
      {
        file: 'modules/campaigns/campaigns.service.ts',
        snippets: ['validateStoreAccess', 'validateAdAccountInStoreAccess', 'validateCampaignAccess', 'applyCampaignScope'],
      },
      {
        file: 'modules/dashboard/dashboard.service.ts',
        snippets: ['validateStoreAccess', 'applyMetricScope', 'applyCampaignScope', 'applyInsightScope', 'applyUserScope'],
      },
      {
        file: 'modules/insights/insights.service.ts',
        snippets: ['validateInsightAccess', 'validateStoreAccess', 'validateCampaignAccess', 'applyInsightScope'],
      },
      {
        file: 'modules/integrations/meta/meta-campaign-recovery.service.ts',
        snippets: ['validateStoreAccess', 'validateAdAccountInStoreAccess', 'validateCampaignInAdAccountAccess'],
      },
      {
        file: 'modules/integrations/meta/meta-sync.service.ts',
        snippets: ['validateStoreAccess', 'validateAdAccountInStoreAccess'],
      },
      {
        file: 'modules/integrations/meta/meta.service.ts',
        snippets: ['validateStoreAccess', 'validateAdAccountInStoreAccess'],
      },
      {
        file: 'modules/metrics/metrics.service.ts',
        snippets: ['validateCampaignAccess', 'validateStoreAccess', 'applyMetricScope'],
      },
      {
        file: 'modules/stores/stores.service.ts',
        snippets: ['applyStoreScope', 'validateStoreAccess', 'validateTenantAccess', 'validateUserAccess'],
      },
      {
        file: 'modules/users/users.service.ts',
        snippets: ['validateTenantAccess', 'applyUserScope', 'validateUserAccess'],
      },
    ];

    for (const { file, snippets } of sourceChecks) {
      const source = fs.readFileSync(path.join(srcRoot, file), 'utf-8');
      for (const snippet of snippets) {
        expect(source).toContain(snippet);
      }
    }
  });
});
