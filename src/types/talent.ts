/**
 * Tipos relacionados a Talentos/Candidatos
 */

import { DateTime, Location, Contact, AvailabilityStatus } from './common';

export interface TalentProfile {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  title?: string;
  bio?: string;
  contact: Contact;
  location: Location;
  availability: AvailabilityStatus;
  hasZolangolaBadge: boolean;
  isVerified: boolean;
  isActive: boolean;
  createdAt: DateTime;
  updatedAt: DateTime;
}

