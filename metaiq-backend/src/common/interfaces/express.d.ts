import { AuthenticatedUser } from './authenticated-user.interface';

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends AuthenticatedUser {}
    interface Request {
      requestId?: string;
    }
  }
}

export {};
