export type ScanCaptureMode = 'Walkthrough' | 'RoomByRoom';
export type ScanEnginePolicy = 'Auto' | 'ForceMast3r' | 'ForceColmap';
export type ScanJobStatus = 'PendingUpload' | 'PendingProcessing' | 'Claimed' | 'Processing' | 'Completed' | 'Failed' | 'Published' | 'Archived';
export type ScanRoomStatus = 'PendingUpload' | 'Uploaded' | 'Processing' | 'Completed' | 'Failed';

export interface ScanRoomJobDto {
  id: string;
  scanJobId: string;
  roomName: string;
  roomOrder: number;
  status: ScanRoomStatus;
  rawVideoKey?: string;
  sogModelKey?: string;
  signedModelUrl?: string;
  metricsJson?: string;
  errorMessage?: string;
  retryCount: number;
}

export interface ScanJobDto {
  id: string;
  propertyId: string;
  attemptId: string;
  attemptCount: number;
  captureMode: ScanCaptureMode;
  enginePolicy: ScanEnginePolicy;
  status: ScanJobStatus;
  workerTokenExpiresAt?: string;
  processingStartedAt?: string;
  lastHeartbeatAt?: string;
  rawClipsExpireAt?: string;
  thumbnailKey?: string;
  thumbnailUrl?: string;
  rawClipsExpired: boolean;
  rooms: ScanRoomJobDto[];
  createdAt: string;
  updatedAt?: string;
}

export interface SceneRoomConfigDto {
  roomName: string;
  defaultSpawnPose?: number[];
  cropBounds?: number[];
  floorTiltDegrees?: number;
  scaleCorrection?: number;
}

export interface SceneHotspotDto {
  id: string;
  sourceRoomId: string;
  targetRoomId: string;
  title: string;
  position: number[];
}

export interface SceneConfigurationDto {
  version: number;
  defaultRoomId?: string;
  rooms: Record<string, SceneRoomConfigDto>;
  hotspots: SceneHotspotDto[];
}

export interface UpdateSceneConfigRequest {
  expectedVersion: number;
  config: SceneConfigurationDto;
}

export interface DispatchTokenResponse {
  scanId: string;
  workerToken: string;
  expiresAt: string;
}

export interface ScanPreviewDto {
  scanId: string;
  propertyId: string;
  propertyTitle: string;
  captureMode: ScanCaptureMode;
  status: ScanJobStatus;
  sceneConfig: SceneConfigurationDto;
  rooms: {
    roomId: string;
    roomName: string;
    status: ScanRoomStatus;
    signedModelUrl?: string;
  }[];
}
