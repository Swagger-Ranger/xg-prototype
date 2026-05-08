export type StudentStatus = 'active' | 'suspended' | 'graduated' | 'withdrawn';
export interface MyStudent {
    id: string;
    user_id: string;
    student_no: string;
    name: string;
    gender: string;
    grade: string;
    college: string;
    major: string;
    class_name: string;
    phone: string;
    email: string;
    status: StudentStatus;
    education_level: string;
    enrollment_date: string;
    created_at: string;
    extended_info?: Record<string, unknown> | null;
}
export declare const STATUS_LABELS: Record<StudentStatus, string>;
export declare function getMyStudent(): Promise<MyStudent | null>;
export declare function getMyExtendedInfo(): Promise<Record<string, unknown>>;
//# sourceMappingURL=student.d.ts.map