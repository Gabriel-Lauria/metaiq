import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CompanyProfile } from '../../core/models';
import { CompanyProfileService } from '../../core/services/company-profile.service';
import { UiService } from '../../core/services/ui.service';

@Component({
  selector: 'app-my-company',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './my-company.component.html',
  styleUrls: ['./my-company.component.scss'],
})
export class MyCompanyComponent {
  private companyProfile = inject(CompanyProfileService);
  private ui = inject(UiService);

  readonly form = signal<CompanyProfile>({ ...this.companyProfile.profile() });
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly loadError = signal('');
  readonly fieldErrors = signal<Partial<Record<keyof CompanyProfile, string>>>({});

  constructor() {
    this.companyProfile.load().subscribe({
      next: (profile) => {
        this.form.set(profile);
        this.loading.set(false);
      },
      error: (error) => {
        const fallbackProfile = (error as { fallbackProfile?: CompanyProfile }).fallbackProfile;
        if (fallbackProfile) {
          this.form.set(fallbackProfile);
        }
        this.loading.set(false);
        this.loadError.set('Nao foi possivel carregar os dados da sua empresa agora.');
      },
    });
  }

  save(): void {
    if (!this.validateForm()) {
      this.ui.showError('Revise os campos', 'Corrija os campos destacados antes de salvar.');
      return;
    }

    this.saving.set(true);
    this.companyProfile.save(this.form()).subscribe({
      next: (savedProfile) => {
        this.form.set(savedProfile);
        this.saving.set(false);
        this.ui.showSuccess('Dados atualizados', 'Essas informacoes ja passam a apoiar a IA no builder.');
      },
      error: (error) => {
        this.saving.set(false);
        const message = error instanceof Error ? error.message : 'Nao foi possivel salvar os dados agora.';
        this.ui.showError('Erro ao salvar', message);
      },
    });
  }

  updateField<K extends keyof CompanyProfile>(field: K, value: CompanyProfile[K]): void {
    this.form.update((current) => ({
      ...current,
      [field]: value,
    }));
    this.companyProfile.saveDraft(this.form());
    this.fieldErrors.update((current) => ({
      ...current,
      [field]: '',
    }));
  }

  private validateForm(): boolean {
    const form = this.form();
    const errors: Partial<Record<keyof CompanyProfile, string>> = {};

    if (!form.businessName.trim()) {
      errors.businessName = 'Informe o nome da empresa.';
    }

    if (form.website.trim() && !/^https?:\/\/\S+$/i.test(form.website.trim())) {
      errors.website = 'Use uma URL completa com http:// ou https://.';
    }

    if (form.instagram.trim() && !/^@?[a-zA-Z0-9._]{1,80}$/.test(form.instagram.trim())) {
      errors.instagram = 'Informe um @handle valido.';
    }

    if (form.whatsapp.trim() && !/^[0-9+\-().\s]{8,32}$/.test(form.whatsapp.trim())) {
      errors.whatsapp = 'Informe um telefone valido.';
    }

    this.fieldErrors.set(errors);
    return Object.keys(errors).length === 0;
  }
}
