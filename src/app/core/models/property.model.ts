export type PropertyStatus = 'Draft' | 'Active' | 'Reserved' | 'Sold' | 'Rented' | 'Archived';
export type FinishingType = 'CoreAndShell' | 'SemiFinished' | 'FullyFinished' | 'UltraSuperLux' | 'Deluxe';
export type ListingType = 'Sale' | 'Rent';

export interface PropertyDto {
  id: string;
  title: string;
  district: string;
  city: string;
  price: number;
  currency: string;
  areaSquareMeters: number;
  floorNumber: number;
  roomsCount: number;
  bathroomsCount: number;
  finishingType: FinishingType;
  listingType: ListingType;
  status: PropertyStatus;
  publicDescription?: string;
  assignedAgentId: string;
  activeScanId?: string;
  thumbnailUrl?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface PropertyPrivateDetailsDto {
  ownerName: string;
  ownerPhone: string;
  exactStreetAddress: string;
  latitude?: number;
  longitude?: number;
  googleMapsUrl?: string;
  internalNotes?: string;
}

export interface PropertyInternalDto extends PropertyDto {
  privateDetails?: PropertyPrivateDetailsDto;
}

export interface CreatePropertyRequestDto {
  title: string;
  district: string;
  city: string;
  price: number;
  currency: string;
  areaSquareMeters: number;
  floorNumber: number;
  roomsCount: number;
  bathroomsCount: number;
  finishingType: string;
  listingType: string;
  publicDescription?: string;
  ownerName: string;
  ownerPhone: string;
  exactStreetAddress: string;
  latitude?: number;
  longitude?: number;
  googleMapsUrl?: string;
  internalNotes?: string;
}

export interface UpdatePropertyRequestDto {
  title: string;
  district: string;
  city: string;
  price: number;
  currency: string;
  areaSquareMeters: number;
  floorNumber: number;
  roomsCount: number;
  bathroomsCount: number;
  finishingType: string;
  listingType: string;
  status: string;
  publicDescription?: string;
  ownerName: string;
  ownerPhone: string;
  exactStreetAddress: string;
  latitude?: number;
  longitude?: number;
  googleMapsUrl?: string;
  internalNotes?: string;
}

export interface ShareLinkDto {
  id: string;
  token: string;
  propertyId: string;
  scanId: string;
  shareUrl: string;
  isActive: boolean;
  viewCount: number;
  lastViewedAt?: string;
  createdAt: string;
}
