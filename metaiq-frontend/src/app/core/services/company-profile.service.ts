import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, tap, throwError } from 'rxjs';
import { CompanyProfile, CompanyProfilePayload, User } from '../models';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

type StoredCompanyProfile = Partial<CompanyProfile>;

@Injectable({ providedIn: 'root' })
export class CompanyProfileService {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private user = signal<User | null>(this.auth.getCurrentUser());
  private profileOverrides = signal<StoredCompanyProfile>({});

  readonly profile = computed<CompanyProfile>(() => {
    const user = this.user();
    const overrides = this.profileOverrides();

    return {
      businessName: overrides.businessName ?? user?.businessName ?? '',
      businessSegment: overrides.businessSegment ?? user?.businessSegment ?? '',
      city: overrides.city ?? user?.defaultCity ?? '',
      state: overrides.state ?? user?.defaultState ?? '',
      website: overrides.website ?? user?.website ?? '',
      instagram: overrides.instagram ?? user?.instagram ?? '',
      whatsapp: overrides.whatsapp ?? user?.whatsapp ?? '',
    };
  });

  constructor() {
    this.auth.currentUser$.subscribe((user) => {
      this.user.set(user);
      this.profileOverrides.set(this.readStoredProfile());
    });
  }

  load(): Observable<CompanyProfile> {
    return this.api.getMyCompany().pipe(
      map((payload) => this.fromPayload(payload)),
      tap((profile) => {
        this.profileOverrides.set({});
        this.persistDraft(profile);
        this.syncAuthContext(profile);
      }),
      catchError((error) => {
        const fallbackProfile = this.mergeProfile(this.profile(), this.readStoredProfile());
        this.profileOverrides.set(this.readStoredProfile());
        return throwError(() => Object.assign(
          error instanceof Error ? error : new Error('Erro ao carregar empresa'),
          { fallbackProfile },
        ));
      }),
    );
  }

  save(profile: CompanyProfile): Observable<CompanyProfile> {
    return this.api.updateMyCompany(this.toPayload(profile)).pipe(
      map((payload) => this.fromPayload(payload)),
      tap((savedProfile) => {
        this.profileOverrides.set({});
        this.persistDraft(savedProfile);
        this.syncAuthContext(savedProfile);
      }),
    );
  }

  saveDraft(profile: CompanyProfile): void {
    const nextProfile: StoredCompanyProfile = {
      businessName: profile.businessName.trim(),
      businessSegment: profile.businessSegment.trim(),
      city: profile.city.trim(),
      state: profile.state.trim().toUpperCase(),
      website: profile.website.trim(),
      instagram: profile.instagram.trim(),
      whatsapp: profile.whatsapp.trim(),
    };

    this.profileOverrides.set(nextProfile);
    this.persistDraft(nextProfile);
  }

  private readStoredProfile(): StoredCompanyProfile {
    try {
      const raw = localStorage.getItem(this.storageKey());
      if (!raw) {
        return {};
      }

      const parsed = JSON.parse(raw) as StoredCompanyProfile;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private storageKey(): string {
    const tenantId = this.user()?.tenantId || 'anonymous';
    return `metaiq.company-profile.${tenantId}`;
  }

  private toPayload(profile: CompanyProfile): CompanyProfilePayload {
    return {
      businessName: profile.businessName.trim(),
      businessSegment: profile.businessSegment.trim(),
      defaultCity: profile.city.trim(),
      defaultState: profile.state.trim().toUpperCase(),
      website: profile.website.trim(),
      instagram: profile.instagram.trim(),
      whatsapp: profile.whatsapp.trim(),
    };
  }

  private fromPayload(payload: CompanyProfilePayload): CompanyProfile {
    return {
      businessName: payload.businessName ?? '',
      businessSegment: payload.businessSegment ?? '',
      city: payload.defaultCity ?? '',
      state: payload.defaultState ?? '',
      website: payload.website ?? '',
      instagram: payload.instagram ?? '',
      whatsapp: payload.whatsapp ?? '',
    };
  }

  private syncAuthContext(profile: CompanyProfile): void {
    this.auth.updateCurrentUserContext({
      businessName: profile.businessName || null,
      businessSegment: profile.businessSegment || null,
      defaultCity: profile.city || null,
      defaultState: profile.state || null,
      website: profile.website || null,
      instagram: profile.instagram || null,
      whatsapp: profile.whatsapp || null,
    });
  }

  private persistDraft(profile: StoredCompanyProfile | CompanyProfile): void {
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify(profile));
    } catch {
      // Local draft persistence is optional.
    }
  }

  private mergeProfile(base: CompanyProfile, overrides: StoredCompanyProfile): CompanyProfile {
    return {
      businessName: overrides.businessName ?? base.businessName,
      businessSegment: overrides.businessSegment ?? base.businessSegment,
      city: overrides.city ?? base.city,
      state: overrides.state ?? base.state,
      website: overrides.website ?? base.website,
      instagram: overrides.instagram ?? base.instagram,
      whatsapp: overrides.whatsapp ?? base.whatsapp,
    };
  }
}
