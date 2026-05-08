import api from './index';

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'textarea';

export interface FieldDefinition {
  id: string;
  code: string;
  label: string;
  field_type: FieldType;
  options: string[] | null;
  placeholder: string | null;
  required: boolean;
  sort_order: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface FieldDefinitionPayload {
  code: string;
  label: string;
  field_type: FieldType;
  options?: string[] | null;
  placeholder?: string | null;
  required?: boolean;
  sort_order?: number;
  enabled?: boolean;
}

export function listFieldDefinitions(onlyEnabled = false): Promise<FieldDefinition[]> {
  return api.get('/field-definitions', { params: { onlyEnabled } }).then((res) => res.data);
}

export function createFieldDefinition(payload: FieldDefinitionPayload): Promise<FieldDefinition> {
  return api.post('/field-definitions', payload).then((res) => res.data);
}

export function updateFieldDefinition(id: string, payload: FieldDefinitionPayload): Promise<FieldDefinition> {
  return api.put(`/field-definitions/${id}`, payload).then((res) => res.data);
}

export function deleteFieldDefinition(id: string): Promise<void> {
  return api.delete(`/field-definitions/${id}`).then(() => undefined);
}

export function updateStudentExtendedInfo(studentId: string, patch: Record<string, unknown>): Promise<void> {
  return api.put(`/students/${studentId}/extended-info`, patch).then(() => undefined);
}
