export type ScanCaptureMode = 'Walkthrough' | 'RoomByRoom';
export type ScanEnginePolicy = 'AutoGsplatWithMast3rFallback' | 'ForceMast3r';
export type ScanJobStatus =
  | 'Draft'
  | 'Uploading'
  | 'PendingProcessing'
  | 'Processing'
  | 'ReadyForReview'
  | 'Published'
  | 'Archived'
  | 'Failed';
export type ScanRoomJobStatus = 'Uploading' | 'Pending' | 'Processing' | 'Completed' | 'Failed';
export type ScanEngineUsed = 'NerfstudioGsplat' | 'Mast3rFallback';

const CAPTURE_MODE_MAP: readonly ScanCaptureMode[] = ['Walkthrough', 'RoomByRoom'];
const ENGINE_POLICY_MAP: readonly ScanEnginePolicy[] = ['AutoGsplatWithMast3rFallback', 'ForceMast3r'];
const SCAN_JOB_STATUS_MAP: readonly ScanJobStatus[] = [
  'Draft',
  'Uploading',
  'PendingProcessing',
  'Processing',
  'ReadyForReview',
  'Published',
  'Archived',
  'Failed'
];
const ROOM_JOB_STATUS_MAP: readonly ScanRoomJobStatus[] = [
  'Uploading',
  'Pending',
  'Processing',
  'Completed',
  'Failed'
];
const ENGINE_USED_MAP: readonly ScanEngineUsed[] = ['NerfstudioGsplat', 'Mast3rFallback'];

function normalizeEnum<T extends string>(val: T | number | string | null | undefined, map: readonly T[], fallback: T): T {
  if (typeof val === 'number' && val >= 0 && val < map.length) {
    return map[val];
  }
  if (typeof val === 'string' && val.trim()) {
    const asInt = Number(val);
    if (!Number.isNaN(asInt) && Number.isInteger(asInt) && asInt >= 0 && asInt < map.length) {
      return map[asInt];
    }
    return val as T;
  }
  return fallback;
}

export const normalizeCaptureMode = (v: ScanCaptureMode | number | string | undefined): ScanCaptureMode =>
  normalizeEnum(v, CAPTURE_MODE_MAP, 'Walkthrough');

export const normalizeEnginePolicy = (v: ScanEnginePolicy | number | string | undefined): ScanEnginePolicy =>
  normalizeEnum(v, ENGINE_POLICY_MAP, 'AutoGsplatWithMast3rFallback');

export const normalizeScanJobStatus = (v: ScanJobStatus | number | string | undefined): ScanJobStatus =>
  normalizeEnum(v, SCAN_JOB_STATUS_MAP, 'Draft');

export const normalizeScanRoomStatus = (v: ScanRoomJobStatus | number | string | undefined): ScanRoomJobStatus =>
  normalizeEnum(v, ROOM_JOB_STATUS_MAP, 'Pending');

export const normalizeEngineUsed = (v: ScanEngineUsed | number | string | null | undefined): string =>
  v === null || v === undefined ? '' : normalizeEnum(v, ENGINE_USED_MAP, 'NerfstudioGsplat');

export interface ScanRoomJobDto {
  id: string;
  scanJobId: string;
  roomId: string;
  roomLabel: string;
  sortOrder: number;
  rawR2Key: string;
  rawSizeBytes: number;
  status: ScanRoomJobStatus | number;
  engineUsed?: ScanEngineUsed | number | null;
  outputR2Key?: string | null;
  outputSizeBytes?: number | null;
  gaussianCount?: number | null;
  metricsJson?: string | null;
  errorMessage?: string | null;
  updatedAt?: string | null;
}

export interface ScanJobDto {
  id: string;
  propertyId: string;
  captureMode: ScanCaptureMode | number;
  enginePolicy: ScanEnginePolicy | number;
  status: ScanJobStatus | number;
  attemptId?: string | null;
  attemptCount: number;
  processingStartedAt?: string | null;
  lastHeartbeatAt?: string | null;
  rawClipsExpireAt?: string | null;
  rawClipsExpired: boolean;
  thumbnailKey?: string | null;
  errorMessage?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt?: string | null;
  rooms: ScanRoomJobDto[];
}

export interface SceneHotspotDto {
  id: string;
  sourceRoomId: string;
  targetRoomId: string;
  title: string;
  position: number[];
}

export interface SceneItemHotspotsPayload {
  cropBounds?: number[];
  floorTiltDegrees?: number;
  scaleCorrection?: number;
  links?: SceneHotspotDto[];
}

export interface SceneItemDto {
  roomId: string;
  roomLabel: string;
  sortOrder: number;
  cameraPosition?: number[] | null;
  cameraTarget?: number[] | null;
  hotspots?: SceneItemHotspotsPayload | SceneHotspotDto[] | null;
}

export interface SceneConfigurationDto {
  scanJobId: string;
  version: number;
  defaultSceneId: string;
  eyeHeightMeters: number;
  scenes: SceneItemDto[];
  updatedAt: string;
  updatedBy: string;
}

export interface UpdateSceneConfigRequest {
  expectedVersion: number;
  defaultSceneId: string;
  eyeHeightMeters: number;
  scenes: SceneItemDto[];
}

export interface DispatchTokenResponse {
  scanId: string;
  workerToken: string;
  expiresAt: string;
}

export interface PublishScanResultDto {
  scanId: string;
  propertyId: string;
  scanStatus: string;
  propertyStatus: string;
  publishedAt: string;
}

export interface ScanPreviewRoomDto {
  roomId: string;
  roomLabel: string;
  sortOrder: number;
  outputR2Key?: string | null;
  signedModelUrl?: string | null;
  gaussianCount?: number | null;
  status: string;
}

export interface ScanPreviewDto {
  scanId: string;
  propertyId: string;
  captureMode: string;
  status: string;
  rooms: ScanPreviewRoomDto[];
  sceneConfig: SceneConfigurationDto;
}

export interface CreateScanClipDto {
  roomId: string;
  roomLabel: string;
  sortOrder: number;
  fileSizeBytes: number;
  mimeType?: string;
}

export interface CreateScanRequestDto {
  captureMode: number;
  enginePolicy: number;
  clips: CreateScanClipDto[];
}

export interface PresignedPartUrlDto {
  partNumber: number;
  url: string;
}

export interface CreateScanRoomUploadDto {
  roomId: string;
  roomLabel: string;
  sortOrder: number;
  rawR2Key: string;
  uploadId: string;
  partSizeBytes: number;
  partCount: number;
  parts: PresignedPartUrlDto[];
}

export interface CreateScanResponseDto {
  scanId: string;
  propertyId: string;
  status: ScanJobStatus | number;
  clips: CreateScanRoomUploadDto[];
}

export interface PartETagDto {
  partNumber: number;
  eTag: string;
}

export interface RoomUploadCompleteDto {
  roomId: string;
  parts: PartETagDto[];
}

export interface CompleteUploadRequestDto {
  rooms: RoomUploadCompleteDto[];
}

export interface RoomTransformDto {
  position: [number, number, number];
  rotationEulerDeg: [number, number, number];
  scale: number;
}

export interface RoomSpawnPoseDto {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export interface AssemblyHotspotDto {
  id: string;
  label: string;
  position: [number, number, number];
  targetInstanceId: string;
  targetPose?: RoomSpawnPoseDto | null;
}

export type CropBoxBoundsTuple = [number, number, number, number, number, number];

export interface AssembledRoomDto {
  instanceId: string;
  sourceScanId: string;
  roomId: string;
  displayLabel: string;
  sortOrder: number;
  signedModelUrl?: string | null;
  gaussianCount?: number | null;
  transform: RoomTransformDto;
  cropBounds?: CropBoxBoundsTuple | number[] | null;
  spawnPose?: RoomSpawnPoseDto | null;
  hotspots?: AssemblyHotspotDto[] | null;
  visible: boolean;
}

export interface PropertyAssemblyDto {
  propertyId: string;
  status: 'Draft' | 'Published' | string;
  version: number;
  defaultInstanceId?: string | null;
  eyeHeightMeters: number;
  rooms: AssembledRoomDto[];
  publishedAt?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export interface PropertyStudioSessionRoomDto {
  scanJobId: string;
  roomId: string;
  roomLabel: string;
  sortOrder: number;
  status: string;
  outputR2Key?: string | null;
  signedModelUrl?: string | null;
  gaussianCount?: number | null;
  outputSizeBytes?: number | null;
  isGlb: boolean;
  isSelectable: boolean;
}

export interface PropertyStudioSessionDto {
  scanJobId: string;
  captureMode: string;
  status: string;
  createdAt: string;
  completedGlbRoomsCount: number;
  rooms: PropertyStudioSessionRoomDto[];
}

export interface PropertyAssemblyStudioDto {
  propertyId: string;
  propertyTitle: string;
  district: string;
  city: string;
  assembly: PropertyAssemblyDto;
  sessions: PropertyStudioSessionDto[];
}

export interface SavePropertyAssemblyRoomRequest {
  instanceId: string;
  sourceScanId: string;
  roomId: string;
  displayLabel: string;
  sortOrder: number;
  transform: RoomTransformDto;
  cropBounds?: CropBoxBoundsTuple | number[] | null;
  spawnPose?: RoomSpawnPoseDto | null;
  hotspots: AssemblyHotspotDto[];
  visible: boolean;
}

export interface SavePropertyAssemblyRequest {
  expectedVersion: number;
  defaultInstanceId?: string | null;
  eyeHeightMeters: number;
  rooms: SavePropertyAssemblyRoomRequest[];
}

export interface PublishPropertyAssemblyResultDto {
  propertyId: string;
  assemblyStatus: string;
  propertyStatus: string;
  version: number;
  publishedAt: string;
}
