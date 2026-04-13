import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, FormGroup, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

type AuthMode = 'login' | 'register';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './auth.component.html',
  styleUrl: './auth.component.scss',
})
export class AuthComponent {
  private authService = inject(AuthService);
  private router      = inject(Router);
  private fb          = inject(FormBuilder);

  mode    = signal<AuthMode>('login');
  loading = signal(false);
  error   = signal('');

  form: FormGroup;

  constructor() {
    this.form = this.fb.group({
      name: [''],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
    });
  }

  toggleMode() {
    this.mode.set(this.mode() === 'login' ? 'register' : 'login');
    this.error.set('');
    this.form.reset();
    
    const nameControl = this.form.get('name');
    if (this.mode() === 'register') {
      nameControl?.setValidators([Validators.required, Validators.minLength(2)]);
    } else {
      nameControl?.clearValidators();
    }
    nameControl?.updateValueAndValidity();
  }

  get isFormValid(): boolean {
    if (this.mode() === 'login') {
      return this.form.get('email')?.valid && this.form.get('password')?.valid;
    }
    return this.form.valid;
  }

  getErrorMessage(field: string): string {
    const control = this.form.get(field);
    if (!control?.errors) return '';

    if (control.errors['required']) return `${field} é obrigatório`;
    if (control.errors['email']) return 'Email inválido';
    if (control.errors['minlength']) {
      const len = control.errors['minlength'].requiredLength;
      return `${field} deve ter no mínimo ${len} caracteres`;
    }
    return 'Campo inválido';
  }

  submit() {
    if (this.loading() || !this.isFormValid) {
      this.error.set('Preencha todos os campos corretamente');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    const { email, password, name } = this.form.value;
    const obs = this.mode() === 'login'
      ? this.authService.login({ email, password })
      : this.authService.register({ email, password, name });

    obs.subscribe({
      next: () => {
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.error.set(err?.error?.message ?? 'Erro ao autenticar. Tente novamente.');
        this.loading.set(false);
      },
    });
  }
}
