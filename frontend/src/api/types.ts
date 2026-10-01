export type Role = 'admin' | 'teacher' | 'student'

export interface User {
  id: number
  name: string
  email: string
  username: string
  role: Role
  group?: string
}

export interface Group {
  id: number
  name: string
  join_code: string
  teacher_id: number
  created_at: string
}

export interface GroupSummary extends Group {
  student_count: number
  assignment_count: number
  pending_count: number
  students_preview: User[]
}

export interface StudentGroup extends Group {
  teacher_name: string
}

export interface AdminTeacher extends User {
  created_at: string | null
  group_count: number
  student_count: number
  assignment_count: number
}

export type IndexStatus = 'local' | 'indexing' | 'indexed' | 'error'

export interface AssignmentDocument {
  id: string
  file_name: string
  summary: string | null
  index_status: IndexStatus
  size_bytes: number | null
  has_file: boolean
  uploaded_at: string | null
}

export interface Assignment {
  id: number
  slug: string
  teacher_id: number
  group_id: number
  title: string
  description: string
  rubric: string | null
  due_date: string | null
  min_words: number
  created_at: string
  documents: AssignmentDocument[]
}

export type EssayStatus = 'draft' | 'submitted' | 'graded'

export interface Essay {
  id: string
  assignment_id: number
  student_id: number
  title: string
  content: string
  outline: string
  status: EssayStatus
  last_saved_at: string | null
  submitted_at: string | null
  grade: number | null
  feedback: string | null
  graded_at: string | null
}

export interface GroupOverview {
  group: GroupSummary
  students: User[]
  assignments: Assignment[]
  essays: Essay[]
}

export interface AssignmentOverview {
  group: Group
  assignment: Assignment
  students: User[]
  former_students: User[]
  essays: Essay[]
}

export interface NewAssignmentInput {
  group_id: number
  title: string
  description: string
  rubric: string
  due_date: string | null
  min_words: number
}

export interface EssayReview {
  group: Group
  assignment: Assignment
  student: User
  essay: Essay | null
}

export interface StudentAssignment {
  assignment: Assignment
  teacher: User
  group: Group
  essay: Essay | null
}

export interface DraftInput {
  title: string
  content: string
  outline: string
}

export interface RegisterInput {
  name: string
  email: string
  password: string
}

export interface TeacherInput {
  name: string
  email: string
  password: string
}

export interface AuthResult {
  token: string
  user: User
}

export interface ApiClient {
  login(username: string, password: string): Promise<AuthResult>
  register(input: RegisterInput): Promise<AuthResult>
  me(token: string): Promise<User>

  listGroups(token: string): Promise<GroupSummary[]>
  createGroup(token: string, name: string): Promise<GroupSummary>
  renameGroup(token: string, groupId: number, name: string): Promise<GroupSummary>
  deleteGroup(token: string, groupId: number): Promise<void>
  regenerateJoinCode(token: string, groupId: number): Promise<GroupSummary>
  getGroupOverview(token: string, groupId: number): Promise<GroupOverview>
  removeStudent(token: string, groupId: number, studentId: number): Promise<void>
  moveStudent(token: string, groupId: number, studentId: number, targetGroupId: number): Promise<void>

  getAssignmentOverview(token: string, assignmentId: number): Promise<AssignmentOverview>
  createAssignment(token: string, input: NewAssignmentInput): Promise<Assignment>
  updateAssignment(token: string, assignmentId: number, changes: Partial<Omit<NewAssignmentInput, 'group_id'>>): Promise<Assignment>
  getEssayReview(token: string, assignmentId: number, studentId: number): Promise<EssayReview>
  gradeEssay(token: string, essayId: string, grade: number, feedback: string): Promise<Essay>
  listDocuments(token: string, assignmentId: number): Promise<AssignmentDocument[]>
  uploadDocuments(token: string, assignmentId: number, files: File[]): Promise<AssignmentDocument[]>
  deleteDocument(token: string, documentId: string): Promise<void>
  getDocumentFile(token: string, documentId: string): Promise<Blob>

  getStudentGroups(token: string): Promise<StudentGroup[]>
  joinGroup(token: string, code: string): Promise<StudentGroup>
  getStudentAssignments(token: string): Promise<StudentAssignment[]>
  getStudentAssignment(token: string, assignmentId: number): Promise<StudentAssignment>
  saveDraft(token: string, assignmentId: number, draft: DraftInput): Promise<Essay>
  submitEssay(token: string, assignmentId: number): Promise<Essay>

  listTeachers(token: string): Promise<AdminTeacher[]>
  createTeacher(token: string, input: TeacherInput): Promise<AdminTeacher>
  updateTeacher(token: string, teacherId: number, changes: Partial<TeacherInput>): Promise<AdminTeacher>
  deleteTeacher(token: string, teacherId: number): Promise<void>
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}
