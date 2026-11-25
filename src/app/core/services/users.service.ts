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
  isActive?: boolean;
  page?: number;
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
      if (filters.isActive !== undefined) params = params.set('isActive', filters.isActive.toString());
      if (filters.page !== undefined) params = params.set('page', filters.page.toString());
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
