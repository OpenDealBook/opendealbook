import type { Enums } from '@odb/supabase';

export type LeadFileRef =
  | {
      kind: 'ppp' | 'sba_7a' | 'sba_504' | 'form_5500' | 'form_5500_sf';
      url: string;
    }
  | { kind: 'state_registry'; dataset: string; url: string; parent?: string };

export type LeadFile = LeadFileRef & { asOf: string };

export type DiscoveredFile = LeadFile | (LeadFileRef & { failure: string });

export type LeadSourceGroup = 'ppp' | 'sba' | 'form_5500' | 'state_registry';

export const LEAD_SOURCE: Record<LeadFile['kind'], Enums<'lead_source'>> = {
  ppp: 'ppp',
  sba_7a: 'sba_7a',
  sba_504: 'sba_504',
  form_5500: 'form_5500',
  form_5500_sf: 'form_5500',
  state_registry: 'state_registry',
};
