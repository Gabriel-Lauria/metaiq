import { CurrentUserService } from './current-user.service';

describe('CurrentUserService', () => {
  let service: CurrentUserService;

  beforeEach(() => {
    service = new CurrentUserService();
  });

  it('should return null when there is no request user', () => {
    expect(service.getUser({})).toBeNull();
    expect(service.getUserId({})).toBeNull();
  });

  it('should return user payload fields when present', () => {
    const request = { user: { id: 'user-123', email: 'test@example.com', role: 'admin' } };

    expect(service.getUser(request)).toEqual(request.user);
    expect(service.getUserId(request)).toBe('user-123');
    expect(service.getUserField(request, 'email')).toBe('test@example.com');
    expect(service.getUserField(request, 'role')).toBe('admin');
  });

  it('should validate ownership correctly', () => {
    const request = { user: { id: 'owner-1' } };

    expect(service.isOwner('owner-1', request)).toBe(true);
    expect(service.isOwner('owner-2', request)).toBe(false);
    expect(service.isOwner('', request)).toBe(false);
  });

  it('should keep compatibility with JWT payloads that still expose sub', () => {
    const request = { user: { sub: 'legacy-user' } };

    expect(service.getUserId(request)).toBe('legacy-user');
  });
});
