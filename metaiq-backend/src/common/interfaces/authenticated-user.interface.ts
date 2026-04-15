import { Role } from '../enums';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  managerId?: string | null;
}
