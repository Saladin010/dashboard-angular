export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  role: 'Admin' | 'Agent';
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
  tokenType: string;
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
}

export interface PatchUserRequest {
  isActive?: boolean;
  role?: 'Admin' | 'Agent';
  fullName?: string;
}

export interface PaginatedListOfUserDto {
  items: UserDto[];
  pageIndex: number;
  totalPages: number;
  totalCount: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}
