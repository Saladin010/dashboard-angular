export type PropertyStatus = 'Draft' | 'Active' | 'Reserved' | 'Sold' | 'Rented' | 'Archived';
export type FinishingType = 'CoreAndShell' | 'SemiFinished' | 'FullyFinished' | 'UltraSuperLux' | 'Deluxe';
export type ListingType = 'Sale' | 'Rent';

export interface PropertyDto {
  id: string;
  title: string;
  district: string;
  city: string;
  listingType: ListingType | string;
  price: number;
  currency: string;
  areaSqm: number;
  floorNumber: number;
  roomsCount: number;
  bathroomsCount: number;
  finishingType: FinishingType | string;
  publicDescription?: string | null;
  status: PropertyStatus | string;
  assignedAgentId: string;
  assignedAgentName?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

export interface PropertyInternalDto extends PropertyDto {
  ownerName: string;
  ownerPhone: string;
  exactStreetAddress: string;
  latitude?: number | null;
  longitude?: number | null;
  googleMapsUrl?: string | null;
  internalNotes?: string | null;
}

export interface CreatePropertyRequestDto {
  title: string;
  district: string;
  city: string;
  listingType: string;
  price: number;
  currency?: string;
  areaSqm: number;
  floorNumber: number;
  roomsCount: number;
  bathroomsCount: number;
  finishingType: string;
  publicDescription?: string;
  assignedAgentId?: string;
  ownerName: string;
  ownerPhone: string;
  exactStreetAddress: string;
  latitude?: number | null;
  longitude?: number | null;
  googleMapsUrl?: string;
  internalNotes?: string;
}

export interface UpdatePropertyRequestDto {
  title: string;
  district: string;
  city: string;
  listingType: string;
  price: number;
  currency?: string;
  areaSqm: number;
  floorNumber: number;
  roomsCount: number;
  bathroomsCount: number;
  finishingType: string;
  publicDescription?: string;
  ownerName: string;
  ownerPhone: string;
  exactStreetAddress: string;
  latitude?: number | null;
  longitude?: number | null;
  googleMapsUrl?: string;
  internalNotes?: string;
}

export interface ShareLinkDto {
  id: string;
  propertyId: string;
  token: string;
  isActive: boolean;
  expiresAt?: string | null;
  viewCount: number;
  createdBy: string;
  createdByName?: string | null;
  createdAt: string;
}
