import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../config/api.config';
import { 
  UserDto, 
  CreateUserRequest, 
  PatchUserRequest, 
  PaginatedListOfUserDto 
} from '../models/auth.model';

export interface UserFilterParams {
  search?: string;
  role?: string;
  isActive?: boolean;
  pageIndex?: number;
  pageSize?: number;
}

@Injectable({
  providedIn: 'root'
})
export class UsersService {
  private readonly http = inject(HttpClient);

  getUsers(filters?: UserFilterParams): Observable<PaginatedListOfUserDto> {
    let params = new HttpParams();
    if (filters) {
      if (filters.search) params = params.set('search', filters.search);
      if (filters.role) params = params.set('role', filters.role);
      if (filters.isActive !== undefined) params = params.set('isActive', filters.isActive.toString());
      if (filters.pageIndex !== undefined) params = params.set('pageIndex', filters.pageIndex.toString());
      if (filters.pageSize !== undefined) params = params.set('pageSize', filters.pageSize.toString());
    }

    const url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.users.list}`;
    return this.http.get<PaginatedListOfUserDto>(url, { params });
  }

  createUser(req: CreateUserRequest): Observable<UserDto> {
    const url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.users.create}`;
    return this.http.post<UserDto>(url, req);
  }

  patchUser(id: string, req: PatchUserRequest): Observable<UserDto> {
    const url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.users.patch(id)}`;
    return this.http.patch<UserDto>(url, req);
  }
}
