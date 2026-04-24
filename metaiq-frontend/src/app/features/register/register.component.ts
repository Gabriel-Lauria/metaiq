import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
  loading = false;
  states: IbgeState[] = [];
  cities: IbgeCity[] = [];
  message = '';
  messageType: 'error' | 'info' = 'info';

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
          this.messageType = 'info';
          this.message = 'Nao foi possivel carregar os estados agora. Voce ainda pode tentar novamente.';
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
              this.messageType = 'info';
              this.message = 'Nao foi possivel carregar as cidades agora.';
            },
          });
      });
  }

  submit(): void {
    if (!this.enablePublicRegister) {
      this.messageType = 'info';
      this.message = 'Cadastro indisponivel no momento.';
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.messageType = 'error';
      this.message = 'Verifique os dados e tente novamente.';
      return;
    }

    if (this.form.value.password !== this.form.value.confirmPassword) {
      this.form.controls.confirmPassword.setErrors({ mismatch: true });
      this.form.controls.confirmPassword.markAsTouched();
      this.messageType = 'error';
      this.message = 'Senha e confirmacao precisam ser iguais.';
      return;
    }

    this.loading = true;
    this.message = '';

    const businessSegment = this.cleanOptional(this.form.value.businessSegment);
    const website = this.cleanOptional(this.form.value.website);
    const instagram = this.cleanOptional(this.form.value.instagram);
    const whatsapp = this.cleanOptional(this.form.value.whatsapp);

    const registerPayload: RegisterRequest = {
      accountType: 'INDIVIDUAL',
      name: this.form.value.name!.trim(),
      email: this.form.value.email!.trim(),
      password: this.form.value.password!,
      businessName: this.form.value.businessName!.trim(),
      defaultState: this.form.value.defaultState!.trim().toUpperCase(),
      defaultCity: this.form.value.defaultCity!.trim(),
      ...(businessSegment ? { businessSegment } : {}),
      ...(website ? { website } : {}),
      ...(instagram ? { instagram } : {}),
      ...(whatsapp ? { whatsapp } : {}),
    };

    this.authService.register(registerPayload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.loading = false;
          this.ui.showSuccess('Conta criada', 'Sua conta ja esta pronta para criar campanhas.');
          this.router.navigate(['/campaigns'], {
            queryParams: { action: 'create', createMode: 'manual' },
          });
        },
        error: (err) => {
          this.loading = false;
          const rawMessage = typeof err?.message === 'string' ? err.message.toLowerCase() : '';
          if (rawMessage.includes('email já cadastrado') || rawMessage.includes('email ja cadastrado') || rawMessage.includes('email já em uso') || rawMessage.includes('email ja em uso')) {
            this.message = 'Esse email ja esta em uso.';
          } else if (err?.status === 400 && typeof err?.message === 'string' && err.message.trim()) {
            this.message = err.message;
          } else if (rawMessage.includes('senha')) {
            this.message = 'Verifique os dados e tente novamente.';
          } else if (err?.status === 0) {
            this.message = 'Nao foi possivel criar sua conta agora.';
          } else {
            this.message = 'Nao foi possivel criar sua conta agora.';
          }
          this.messageType = 'error';
        },
      });
  }

  fieldError(fieldName: keyof typeof this.form.controls): string {
    const field = this.form.controls[fieldName];
    if (!field.touched || !field.errors) return '';
    if (field.errors['required']) return 'Campo obrigatorio.';
    if (field.errors['email']) return 'Email invalido.';
    if (field.errors['minlength']) return `Minimo de ${field.errors['minlength'].requiredLength} caracteres.`;
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
}
