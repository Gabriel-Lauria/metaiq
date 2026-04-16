import { AuthenticatedUser } from './authenticated-user.interface';

declare global {
  namespace Express {
    interface User extends AuthenticatedUser {}
    interface Request {
      requestId?: string;
    }
  }
}

export {};
