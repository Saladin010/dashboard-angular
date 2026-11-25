import { PaginatedResponse } from './common.model';

export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  role: 'Admin' | 'Agent';
  officePhone?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResultDto {
  accessToken: string;
  refreshToken: string;
  tokenType?: string;
  expiresIn: number;
  user: UserDto;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  refreshToken: string;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  fullName: string;
  role: 'Admin' | 'Agent';
  officePhone?: string;
}

export interface PatchUserRequest {
  isActive?: boolean;
  role?: 'Admin' | 'Agent';
  officePhone?: string;
}

export type PaginatedListOfUserDto = PaginatedResponse<UserDto>;
