/**
 * Tipos comuns compartilhados
 */

export type DateTime = string; // ISO 8601 format
export type DateOnly = string; // YYYY-MM-DD format

export type JobStatus = 'active' | 'suspended' | 'closed' | 'draft';
export type ApplicationStatus = 'pending' | 'reviewing' | 'interview' | 'offer' | 'accepted' | 'rejected';
export type AvailabilityStatus = 'available' | 'employed' | 'in_process';
export type JobType = 'full_time' | 'part_time' | 'freelance' | 'internship' | 'temporary';
export type UserRole = 'talent' | 'company' | 'admin';

export interface Location {
  city: string;
  province?: string;
  country: string;
  isRemote: boolean;
}

export interface Contact {
  email: string;
  phone?: string;
  website?: string;
}

