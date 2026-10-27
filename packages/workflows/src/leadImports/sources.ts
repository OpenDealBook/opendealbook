import { sbaUpsertKey } from '@odb/comps';
import type { TablesInsert } from '@odb/supabase';

import type { RecordReader } from './recordReader';

type Imported<T extends 'ppp_loan' | 'sba_loan' | 'form_5500_filing'> = Omit<
  TablesInsert<T>,
  'business_id' | 'import_id' | 'id'
>;

export type PppLoan = Imported<'ppp_loan'>;
export type SbaLoan = Imported<'sba_loan'> & { program: 'sba_7a' | 'sba_504' };
export type Form5500Filing = Imported<'form_5500_filing'>;

export const PPP_COLUMNS = [
  'LoanNumber',
  'BorrowerName',
  'BorrowerAddress',
  'BorrowerCity',
  'BorrowerState',
  'BorrowerZip',
  'NAICSCode',
  'BusinessAgeDescription',
  'JobsReported',
  'CurrentApprovalAmount',
  'DateApproved',
];

export function parsePpp(reader: RecordReader): PppLoan {
  return {
    loan_number: reader.required('LoanNumber'),
    borrower_name: reader.required('BorrowerName'),
    address_line1: reader.text('BorrowerAddress'),
    city: reader.text('BorrowerCity'),
    state: reader.text('BorrowerState'),
    postal_code: reader.text('BorrowerZip'),
    naics_code: reader.naics('NAICSCode'),
    business_age_description: reader.text('BusinessAgeDescription'),
    jobs_reported: reader.int('JobsReported'),
    loan_amount: reader.money('CurrentApprovalAmount'),
    approved_on: reader.usDate('DateApproved'),
  };
}

export const SBA_COLUMNS = [
  'Program',
  'LocationID',
  'BorrName',
  'BorrStreet',
  'BorrCity',
  'BorrState',
  'BorrZip',
  'NaicsCode',
  'JobsSupported',
  'GrossApproval',
  'ApprovalDate',
];

export function parseSba(program: SbaLoan['program']) {
  return (reader: RecordReader): SbaLoan => ({
    source_key: sbaUpsertKey(reader.record),
    program,
    borrower_name: reader.required('BorrName'),
    address_line1: reader.text('BorrStreet'),
    city: reader.text('BorrCity'),
    state: reader.text('BorrState'),
    postal_code: reader.text('BorrZip'),
    naics_code: reader.naics('NaicsCode'),
    jobs_supported: reader.int('JobsSupported'),
    loan_amount: reader.money('GrossApproval'),
    approved_on: reader.isoDate('ApprovalDate'),
  });
}

export const FORM_5500_COLUMNS = [
  'ACK_ID',
  'SPONS_DFE_EIN',
  'SPONSOR_DFE_NAME',
  'SPONS_DFE_MAIL_US_ADDRESS1',
  'SPONS_DFE_MAIL_US_CITY',
  'SPONS_DFE_MAIL_US_STATE',
  'SPONS_DFE_MAIL_US_ZIP',
  'TOT_PARTCP_BOY_CNT',
  'FORM_PLAN_YEAR_BEGIN_DATE',
];

export function parseForm5500(reader: RecordReader): Form5500Filing {
  return {
    ack_id: reader.required('ACK_ID'),
    ein: reader.ein('SPONS_DFE_EIN'),
    sponsor_name: reader.required('SPONSOR_DFE_NAME'),
    address_line1: reader.text('SPONS_DFE_MAIL_US_ADDRESS1'),
    city: reader.text('SPONS_DFE_MAIL_US_CITY'),
    state: reader.text('SPONS_DFE_MAIL_US_STATE'),
    postal_code: reader.text('SPONS_DFE_MAIL_US_ZIP'),
    participant_count: reader.int('TOT_PARTCP_BOY_CNT'),
    plan_year_begin: reader.isoDate('FORM_PLAN_YEAR_BEGIN_DATE'),
  };
}

export const FORM_5500_SF_COLUMNS = [
  'ACK_ID',
  'SF_SPONS_EIN',
  'SF_SPONSOR_NAME',
  'SF_SPONS_US_ADDRESS1',
  'SF_SPONS_US_CITY',
  'SF_SPONS_US_STATE',
  'SF_SPONS_US_ZIP',
  'SF_TOT_PARTCP_BOY_CNT',
  'SF_PLAN_YEAR_BEGIN_DATE',
];

export function parseForm5500Sf(reader: RecordReader): Form5500Filing {
  return {
    ack_id: reader.required('ACK_ID'),
    ein: reader.ein('SF_SPONS_EIN'),
    sponsor_name: reader.required('SF_SPONSOR_NAME'),
    address_line1: reader.text('SF_SPONS_US_ADDRESS1'),
    city: reader.text('SF_SPONS_US_CITY'),
    state: reader.text('SF_SPONS_US_STATE'),
    postal_code: reader.text('SF_SPONS_US_ZIP'),
    participant_count: reader.int('SF_TOT_PARTCP_BOY_CNT'),
    plan_year_begin: reader.isoDate('SF_PLAN_YEAR_BEGIN_DATE'),
  };
}
