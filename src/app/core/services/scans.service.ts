import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_CONFIG } from '../config/api.config';
import {
  ScanJobDto,
  ScanPreviewDto,
  DispatchTokenResponse,
  UpdateSceneConfigRequest,
  SceneConfigurationDto,
  PublishScanResultDto
} from '../models/scan.model';

@Injectable({
  providedIn: 'root'
})
export class ScansService {
  private readonly http = inject(HttpClient);

  getScan(scanId: string): Observable<ScanJobDto> {
    const url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.scans.get(scanId)}`;
    return this.http.get<ScanJobDto>(url);
  }

  getScanPreview(scanId: string): Observable<ScanPreviewDto> {
    const url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.scans.preview(scanId)}`;
    return this.http.get<ScanPreviewDto>(url);
  }

  generateDispatchToken(scanId: string): Observable<DispatchTokenResponse> {
    const url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.scans.dispatchToken(scanId)}`;
    return this.http.post<DispatchTokenResponse>(url, {});
  }

  retryFailedRooms(scanId: string): Observable<ScanJobDto> {
    const url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.scans.retry(scanId)}`;
    return this.http.post<ScanJobDto>(url, {});
  }

  updateSceneConfig(scanId: string, req: UpdateSceneConfigRequest): Observable<SceneConfigurationDto> {
    const url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.scans.sceneConfig(scanId)}`;
    return this.http.put<SceneConfigurationDto>(url, req);
  }

  publishScan(scanId: string): Observable<PublishScanResultDto> {
    const url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.scans.publish(scanId)}`;
    return this.http.post<PublishScanResultDto>(url, {});
  }
}
