import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CompanyProfileService } from '../../core/services/company-profile.service';
import { UiService } from '../../core/services/ui.service';
import { MyCompanyComponent } from './my-company.component';

describe('MyCompanyComponent', () => {
  let fixture: ComponentFixture<MyCompanyComponent>;
  let component: MyCompanyComponent;
  let companyProfile: jasmine.SpyObj<CompanyProfileService>;
  let ui: jasmine.SpyObj<UiService>;

  beforeEach(async () => {
    companyProfile = jasmine.createSpyObj<CompanyProfileService>('CompanyProfileService', ['load', 'save', 'saveDraft'], {
      profile: signal({
        businessName: '',
        businessSegment: '',
        city: '',
        state: '',
        website: '',
        instagram: '',
        whatsapp: '',
      }),
    });
    ui = jasmine.createSpyObj<UiService>('UiService', ['showSuccess', 'showError']);

    companyProfile.load.and.returnValue(of({
      businessName: 'Pet Feliz',
      businessSegment: 'Pet shop',
      city: 'Curitiba',
      state: 'PR',
      website: 'https://petfeliz.com.br',
      instagram: '@petfeliz',
      whatsapp: '(41) 99999-9999',
    }));
    companyProfile.save.and.returnValue(of({
      businessName: 'Pet Feliz',
      businessSegment: 'Pet shop',
      city: 'Curitiba',
      state: 'PR',
      website: 'https://petfeliz.com.br',
      instagram: '@petfeliz',
      whatsapp: '(41) 99999-9999',
    }));

    await TestBed.configureTestingModule({
      imports: [MyCompanyComponent],
      providers: [
        { provide: CompanyProfileService, useValue: companyProfile },
        { provide: UiService, useValue: ui },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MyCompanyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads company data from backend on init', () => {
    expect(companyProfile.load).toHaveBeenCalled();
    expect(component.form().businessName).toBe('Pet Feliz');
  });

  it('saves through PATCH /me/company flow', () => {
    component.updateField('businessName', 'Pet Feliz');
    component.save();

    expect(companyProfile.save).toHaveBeenCalledWith(jasmine.objectContaining({
      businessName: 'Pet Feliz',
    }));
    expect(ui.showSuccess).toHaveBeenCalled();
  });

  it('stores only draft data locally while editing', () => {
    component.updateField('website', 'https://petfeliz.com.br');
    expect(companyProfile.saveDraft).toHaveBeenCalledWith(jasmine.objectContaining({
      website: 'https://petfeliz.com.br',
    }));
    expect(companyProfile.load).toHaveBeenCalledTimes(1);
  });
});
