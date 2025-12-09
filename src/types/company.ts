/**
 * Tipos relacionados a Empresas
 */

import { DateTime, Location, Contact } from './common';

export interface CompanyProfile {
  id: string;
  companyName: string;
  nif: string;
  contact: Contact;
  location: Location;
  description?: string;
  website?: string;
  industry?: string;
  companySize?: string;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  createdAt: DateTime;
  updatedAt: DateTime;
}

