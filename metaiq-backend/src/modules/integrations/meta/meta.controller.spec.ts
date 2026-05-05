import 'reflect-metadata';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { Role } from '../../../common/enums';
import { MetaIntegrationController } from './meta.controller';

describe('MetaIntegrationController metadata', () => {
  it('bloqueia CLIENT no endpoint de upload de imagem Meta', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, MetaIntegrationController.prototype.uploadImageAsset) as Role[];

    expect(roles).toEqual([
      Role.PLATFORM_ADMIN,
      Role.ADMIN,
      Role.MANAGER,
      Role.OPERATIONAL,
    ]);
    expect(roles).not.toContain(Role.CLIENT);
  });
});
