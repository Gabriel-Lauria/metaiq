import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Role, User } from '../models';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { CompanyProfileService } from './company-profile.service';

describe('CompanyProfileService', () => {
  let service: CompanyProfileService;
  let api: jasmine.SpyObj<ApiService>;
  let auth: jasmine.SpyObj<AuthService>;
  let currentUser: User;

  beforeEach(() => {
    localStorage.clear();
    currentUser = {
      id: 'user-1',
      email: 'owner@metaiq.dev',
      name: 'Owner',
      role: Role.ADMIN,
      tenantId: 'tenant-1',
      businessName: 'Empresa inicial',
      defaultCity: 'Curitiba',
      defaultState: 'PR',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    api = jasmine.createSpyObj<ApiService>('ApiService', ['getMyCompany', 'updateMyCompany']);
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['getCurrentUser', 'updateCurrentUserContext'], {
      currentUser$: of(currentUser),
    });
    auth.getCurrentUser.and.returnValue(currentUser);

    TestBed.configureTestingModule({
      providers: [
        CompanyProfileService,
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: auth },
      ],
    });

    service = TestBed.inject(CompanyProfileService);
  });

  it('loads company data from backend and updates auth context', () => {
    localStorage.setItem('metaiq.company-profile.tenant-1', JSON.stringify({
      businessName: 'Rascunho local',
    }));
    api.getMyCompany.and.returnValue(of({
      businessName: 'Pet Feliz',
      businessSegment: 'Pet shop',
      defaultCity: 'Curitiba',
      defaultState: 'PR',
      website: 'https://petfeliz.com.br',
      instagram: '@petfeliz',
      whatsapp: '(41) 99999-9999',
    }));

    let loadedName = '';
    service.load().subscribe((profile) => {
      loadedName = profile.businessName;
    });

    expect(api.getMyCompany).toHaveBeenCalled();
    expect(loadedName).toBe('Pet Feliz');
    expect(auth.updateCurrentUserContext).toHaveBeenCalledWith(jasmine.objectContaining({
      businessName: 'Pet Feliz',
      website: 'https://petfeliz.com.br',
    }));
  });

  it('saves company data via patch endpoint', () => {
    api.updateMyCompany.and.returnValue(of({
      businessName: 'Pet Feliz',
      businessSegment: 'Pet shop',
      defaultCity: 'Curitiba',
      defaultState: 'PR',
      website: 'https://petfeliz.com.br',
      instagram: '@petfeliz',
      whatsapp: '(41) 99999-9999',
    }));

    service.save({
      businessName: 'Pet Feliz',
      businessSegment: 'Pet shop',
      city: 'Curitiba',
      state: 'pr',
      website: 'https://petfeliz.com.br',
      instagram: '@petfeliz',
      whatsapp: '(41) 99999-9999',
    }).subscribe();

    expect(api.updateMyCompany).toHaveBeenCalledWith({
      businessName: 'Pet Feliz',
      businessSegment: 'Pet shop',
      defaultCity: 'Curitiba',
      defaultState: 'PR',
      website: 'https://petfeliz.com.br',
      instagram: '@petfeliz',
      whatsapp: '(41) 99999-9999',
    });
  });
});
