import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { UiService } from '../../core/services/ui.service';
import { IbgeCity, IbgeState, RegisterRequest } from '../../core/models';
import { environment } from '../../core/environment';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
})
export class RegisterComponent implements OnInit {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private api = inject(ApiService);
  private ui = inject(UiService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  readonly enablePublicRegister = environment.enablePublicRegister;
  isSubmitting = false;
  states: IbgeState[] = [];
  cities: IbgeCity[] = [];
  errorMessage: string | null = null;
  infoMessage: string | null = null;

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required]],
    businessName: ['', [Validators.required, Validators.minLength(2)]],
    businessSegment: [''],
    defaultState: ['', [Validators.required]],
    defaultCity: ['', [Validators.required]],
    website: ['', [Validators.pattern(/^$|^https:\/\/\S+$/i)]],
    instagram: [''],
    whatsapp: [''],
  });

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      const user = this.authService.getCurrentUser();
      queueMicrotask(() => this.router.navigate([user?.accountType === 'INDIVIDUAL' ? '/campaigns' : '/dashboard']));
      return;
    }

    if (!this.enablePublicRegister) {
      return;
    }

    this.api.getIbgeStates()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (states) => {
          this.states = [...states].sort((a, b) => a.name.localeCompare(b.name));
        },
        error: () => {
          this.setInfoMessageDeferred('Não foi possível carregar os estados agora. Você ainda pode tentar novamente.');
        },
      });

    this.form.controls.defaultState.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((uf) => {
        this.form.controls.defaultCity.setValue('');
        this.cities = [];

        if (!uf) {
          return;
        }

        this.api.getIbgeCities(uf)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (cities) => {
              this.cities = [...cities].sort((a, b) => a.name.localeCompare(b.name));
            },
            error: () => {
              this.setInfoMessageDeferred('Não foi possível carregar as cidades agora.');
            },
          });
      });
  }

  submit(): void {
    if (!this.enablePublicRegister) {
      this.clearMessages();
      this.infoMessage = 'Novas contas estão sendo liberadas por janela operacional.';
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.clearMessages();
      this.errorMessage = 'Verifique os dados e tente novamente.';
      return;
    }

    if (this.form.value.password !== this.form.value.confirmPassword) {
      this.form.controls.confirmPassword.setErrors({ mismatch: true });
      this.form.controls.confirmPassword.markAsTouched();
      this.clearMessages();
      this.errorMessage = 'Senha e confirmação precisam ser iguais.';
      return;
    }

    this.clearMessages();
    this.isSubmitting = true;

    const payload = this.form.getRawValue();
    const businessSegment = this.cleanOptional(payload.businessSegment);
    const website = this.cleanOptional(payload.website);
    const instagram = this.cleanOptional(payload.instagram);
    const whatsapp = this.cleanOptional(payload.whatsapp);

    const registerPayload: RegisterRequest = {
      accountType: 'INDIVIDUAL',
      name: payload.name!.trim(),
      email: payload.email!.trim(),
      password: payload.password!,
      businessName: payload.businessName!.trim(),
      defaultState: payload.defaultState!.trim().toUpperCase(),
      defaultCity: payload.defaultCity!.trim(),
      ...(businessSegment ? { businessSegment } : {}),
      ...(website ? { website } : {}),
      ...(instagram ? { instagram } : {}),
      ...(whatsapp ? { whatsapp } : {}),
    };

    this.authService.register(registerPayload)
      .pipe(
        finalize(() => {
          this.isSubmitting = false;
          console.log('REGISTER FINALIZE - loading desligado');
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.ui.showSuccess('Conta criada', 'Sua conta já está pronta para estruturar campanhas.');
          this.router.navigate(['/campaigns'], {
            queryParams: { action: 'create', createMode: 'manual' },
          });
        },
        error: (err: HttpErrorResponse) => {
          console.error('REGISTER ERROR:', err);
          this.errorMessage = this.resolveRegisterErrorMessage(err);
        },
      });
  }

  fieldError(fieldName: keyof typeof this.form.controls): string {
    const field = this.form.controls[fieldName];
    if (!field.touched || !field.errors) return '';
    if (field.errors['required']) return 'Campo obrigatório.';
    if (field.errors['email']) return 'Email inválido.';
    if (field.errors['minlength']) return `Mínimo de ${field.errors['minlength'].requiredLength} caracteres.`;
    if (field.errors['pattern']) {
      if (fieldName === 'website') return 'Use uma URL com https://';
    }
    if (field.errors['mismatch']) return 'As senhas precisam ser iguais.';
    return 'Verifique este campo.';
  }

  private cleanOptional(value: string | null | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  }

  private resolveRegisterErrorMessage(error: HttpErrorResponse | { status?: number; error?: { message?: string | string[] } | null; message?: string; details?: { message?: string | string[] } | null }): string {
    if (error?.status === 409) {
      return 'Este email já está cadastrado. Faça login ou use outro email.';
    }

    const errorWithDetails = error as { details?: { message?: string | string[] } | null };
    const backendMessage = this.extractErrorMessage(error?.error)
      || this.extractErrorMessage(errorWithDetails.details)
      || (typeof error?.message === 'string' ? error.message.trim() : '');

    return backendMessage || 'Não foi possível criar sua conta. Tente novamente.';
  }

  private extractErrorMessage(source: { message?: string | string[] } | null | undefined): string {
    if (!source) {
      return '';
    }

    if (typeof source.message === 'string') {
      return source.message.trim();
    }

    if (Array.isArray(source.message)) {
      return source.message.map((item) => String(item).trim()).filter(Boolean).join(' ');
    }

    return '';
  }

  private clearMessages(): void {
    this.errorMessage = null;
    this.infoMessage = null;
  }

  private setInfoMessageDeferred(message: string): void {
    queueMicrotask(() => {
      this.errorMessage = null;
      this.infoMessage = message;
    });
  }
}
