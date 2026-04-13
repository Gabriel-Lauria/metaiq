import { Component, OnInit, DestroyRef } from '@angular/core';
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
  error = '';

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
      this.router.navigate(['/dashboard']);
    }
  }

  private initializeForms(): void {
    this.loginForm = this.fb.group({
      email: ['demo@metaiq.dev', [Validators.required, Validators.email]],
      password: ['Demo@1234', [Validators.required, Validators.minLength(6)]]
    });

    this.registerForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]]
    });
  }

  toggleMode(): void {
    this.isLogin = !this.isLogin;
    this.error = '';
  }

  onSubmit(): void {
    const form = this.isLogin ? this.loginForm : this.registerForm;
    if (form.invalid) {
      this.error = 'Por favor, preencha todos os campos corretamente';
      return;
    }

    this.loading = true;
    this.error = '';

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
            this.loading = false;
            this.error = err?.message || 'Erro ao fazer login. Verifique suas credenciais.';
          }
        });
    } else {
      this.authService
        .register(form.value)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.uiService.showSuccess('Conta criada', 'Sua conta foi criada com sucesso! Faça login para continuar.');
            this.isLogin = true;
            this.loginForm.patchValue({
              email: form.value.email,
              password: form.value.password
            });
            this.error = '';
            setTimeout(() => (this.error = ''), 3000);
          },
          error: (err) => {
            this.loading = false;
            this.error = err?.message || 'Erro ao criar conta. Tente novamente.';
          }
        });
    }
  }

  getFieldError(fieldName: string): string {
    const form = this.isLogin ? this.loginForm : this.registerForm;
    const field = form.get(fieldName);
    if (!field || !field.errors || !field.touched) return '';

    if (field.errors['required']) return 'Este campo é obrigatório';
    if (field.errors['email']) return 'Email inválido';
    if (field.errors['minlength'])
      return `Mínimo ${field.errors['minlength'].requiredLength} caracteres`;

    return '';
  }
}
