import { Component, DestroyRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/services/auth.service';
import { UiService } from '../../core/services/ui.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './auth.component.html',
  styleUrls: ['./auth.component.scss']
})
export class AuthComponent implements OnInit {
  loginForm!: FormGroup;
  registerForm!: FormGroup;
  isLogin = true;
  loading = false;
  message = '';
  messageType: 'error' | 'success' | 'info' = 'info';
  apiOffline = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private uiService: UiService,
    private router: Router,
    private destroyRef: DestroyRef
  ) {
    this.initializeForms();
  }

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      queueMicrotask(() => this.router.navigate(['/dashboard']));
    }
  }

  private initializeForms(): void {
    this.loginForm = this.fb.group({
      email: ['demo@metaiq.dev', [Validators.required, Validators.email]],
      password: ['Demo@1234', [Validators.required, Validators.minLength(6)]]
    });

    this.registerForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]]
    });
  }

  toggleMode(): void {
    this.isLogin = !this.isLogin;
    this.clearMessage();
    this.loginForm.markAsPristine();
    this.registerForm.markAsPristine();
  }

  onSubmit(): void {
    const form = this.isLogin ? this.loginForm : this.registerForm;
    if (form.invalid) {
      form.markAllAsTouched();
      this.setMessage('error', 'Revise os campos marcados antes de continuar.');
      return;
    }

    if (!this.isLogin && form.value.password !== form.value.confirmPassword) {
      form.get('confirmPassword')?.setErrors({ mismatch: true });
      form.get('confirmPassword')?.markAsTouched();
      this.setMessage('error', 'As senhas precisam ser iguais.');
      return;
    }

    this.loading = true;
    this.clearMessage();

    if (this.isLogin) {
      this.authService
        .login(form.value)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.uiService.showSuccess('Login realizado', 'Bem-vindo de volta!');
            this.router.navigate(['/dashboard']);
          },
          error: (err) => {
            this.deferAuthError(err, 'Erro ao fazer login. Verifique suas credenciais.');
          }
        });
    } else {
      const { name, email, password } = form.value;
      this.authService
        .register({ name, email, password })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.loading = false;
            this.uiService.showSuccess('Conta criada', 'Sua conta foi criada com sucesso! Faça login para continuar.');
            this.isLogin = true;
            this.loginForm.patchValue({
              email,
              password
            });
            this.setMessage('success', 'Conta criada. Confira os dados e entre.');
          },
          error: (err) => {
            this.deferAuthError(err, 'Erro ao criar conta. Tente novamente.');
          }
        });
    }
  }

  getFieldError(form: FormGroup, fieldName: string): string {
    const field = form.get(fieldName);
    if (!field || !field.errors || !field.touched) return '';

    if (field.errors['required']) return 'Este campo é obrigatório';
    if (field.errors['email']) return 'Email inválido';
    if (field.errors['mismatch']) return 'As senhas não conferem';
    if (field.errors['minlength'])
      return `Mínimo ${field.errors['minlength'].requiredLength} caracteres`;

    return '';
  }

  isInvalid(form: FormGroup, fieldName: string): boolean {
    const field = form.get(fieldName);
    return Boolean(field?.touched && field.invalid);
  }

  private clearMessage(): void {
    this.message = '';
    this.apiOffline = false;
  }

  private setMessage(type: 'error' | 'success' | 'info', message: string): void {
    this.messageType = type;
    this.message = message;
  }

  private handleAuthError(err: any, fallback: string): void {
    this.apiOffline = err?.status === 0;
    const offlineMessage = 'Backend offline. Inicie o backend em http://localhost:3004 e tente novamente.';
    this.setMessage('error', this.apiOffline ? offlineMessage : err?.message || fallback);
  }

  private deferAuthError(err: any, fallback: string): void {
    setTimeout(() => {
      this.loading = false;
      this.handleAuthError(err, fallback);
    });
  }
}
