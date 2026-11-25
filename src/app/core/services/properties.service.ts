import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../config/api.config';
import { PaginatedResponse } from '../models/common.model';
import {
  PropertyDto,
  PropertyInternalDto,
  CreatePropertyRequestDto,
  UpdatePropertyRequestDto,
  ShareLinkDto
} from '../models/property.model';
import { ScanJobDto } from '../models/scan.model';

export interface PropertyFilterParams {
  search?: string;
  district?: string;
  status?: string;
  listingType?: string;
  page?: number;
  pageSize?: number;
}

@Injectable({
  providedIn: 'root'
})
export class PropertiesService {
  private readonly http = inject(HttpClient);

  getProperties(filters?: PropertyFilterParams): Observable<PaginatedResponse<PropertyDto>> {
    let params = new HttpParams();
    if (filters) {
      if (filters.search) params = params.set('search', filters.search);
      if (filters.district) params = params.set('district', filters.district);
      if (filters.status) params = params.set('status', filters.status);
      if (filters.listingType) params = params.set('listingType', filters.listingType);
      if (filters.page !== undefined) params = params.set('page', filters.page.toString());
      if (filters.pageSize !== undefined) params = params.set('pageSize', filters.pageSize.toString());
    }

    const url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.properties.list}`;
    return this.http.get<PaginatedResponse<PropertyDto>>(url, { params });
  }

  getPropertyById(id: string): Observable<PropertyInternalDto> {
    const url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.properties.get(id)}`;
    return this.http.get<PropertyInternalDto>(url);
  }

  createProperty(dto: CreatePropertyRequestDto): Observable<PropertyInternalDto> {
    const url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.properties.create}`;
    return this.http.post<PropertyInternalDto>(url, dto);
  }

  updateProperty(id: string, dto: UpdatePropertyRequestDto): Observable<PropertyInternalDto> {
    const url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.properties.update(id)}`;
    return this.http.put<PropertyInternalDto>(url, dto);
  }

  getPropertyScans(propertyId: string): Observable<ScanJobDto[]> {
    const url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.properties.scans(propertyId)}`;
    return this.http.get<ScanJobDto[]>(url);
  }

  getShareLinks(propertyId: string): Observable<ShareLinkDto[]> {
    const url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.properties.shareLinks(propertyId)}`;
    return this.http.get<ShareLinkDto[]>(url);
  }

  createShareLink(propertyId: string): Observable<ShareLinkDto> {
    const url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.properties.createShareLink(propertyId)}`;
    return this.http.post<ShareLinkDto>(url, {});
  }

  revokeShareLink(linkId: string): Observable<void> {
    const url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.properties.revokeShareLink(linkId)}`;
    return this.http.delete<void>(url);
  }
}
