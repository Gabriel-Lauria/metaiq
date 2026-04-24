import { Injectable, computed, inject, signal } from '@angular/core';
import { AccountType, User } from '../models';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class AccountContextService {
  private auth = inject(AuthService);
  private user = signal<User | null>(this.auth.getCurrentUser());

  readonly currentUser = computed(() => this.user());
  readonly accountType = computed<AccountType>(() => this.currentUser()?.accountType ?? 'AGENCY');
  readonly isIndividual = computed(() => this.accountType() === 'INDIVIDUAL');
  readonly isAgency = computed(() => this.accountType() === 'AGENCY');
  readonly fixedStoreId = computed(() => this.currentUser()?.storeId ?? null);

  constructor() {
    this.auth.currentUser$.subscribe((user) => {
      this.user.set(user);
    });
  }

  isIndividualAccount(): boolean {
    return this.isIndividual();
  }

  isAgencyAccount(): boolean {
    return this.isAgency();
  }
}
