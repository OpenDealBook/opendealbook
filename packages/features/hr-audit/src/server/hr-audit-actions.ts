'use server';

import { enhanceAction } from '@tuckin/next/actions';
import { getSupabaseServerClient } from '@tuckin/supabase/server';

import { employeeSchema, updateEmployeeSchema } from '../schema/employee.schema';
import {
  hrAuditEngagementSchema,
  updateHrAuditEngagementSchema,
} from '../schema/hr-audit-engagement.schema';

export const createHrAuditEngagement = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { data: row, error } = await client
      .from('hr_audit_engagement')
      .insert(data)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return row;
  },
  { auth: true, schema: hrAuditEngagementSchema },
);

export const updateHrAuditEngagement = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();
    const { id, ...fields } = data;

    const { data: row, error } = await client
      .from('hr_audit_engagement')
      .update(fields)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return row;
  },
  { auth: true, schema: updateHrAuditEngagementSchema },
);

export const addEmployee = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { data: row, error } = await client
      .from('employee')
      .insert(data)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return row;
  },
  { auth: true, schema: employeeSchema },
);

export const updateEmployee = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();
    const { id, ...fields } = data;

    const { data: row, error } = await client
      .from('employee')
      .update(fields)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return row;
  },
  { auth: true, schema: updateEmployeeSchema },
);
