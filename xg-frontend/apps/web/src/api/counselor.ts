import api from './index';

export interface ClassRosterEntry {
  user_id: number;
  student_no: string;
  name: string;
  class_id: number | null;
  class_name: string | null;
  grade: string | null;
  status: string;
}

export function getClassRoster(): Promise<ClassRosterEntry[]> {
  return api.get('/counselor/class-roster').then((res) => res.data ?? []);
}
