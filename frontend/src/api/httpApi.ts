import { ApiError, type ApiClient } from './types'

// En producción el frontend (Firebase Hosting) llama directo al servicio de Cloud Run; en desarrollo, al proxy de Vite
export const API_ORIGIN = import.meta.env.VITE_API_BASE ?? ''
const BASE = `${API_ORIGIN}/api`

async function send(path: string, init: RequestInit & { token?: string } = {}): Promise<Response> {
  const { token, headers, body, ...rest } = init
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...rest,
      body,
      headers: {
        // FormData define su propio Content-Type con el boundary del multipart
        ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    })
  } catch {
    throw new ApiError('No se pudo conectar con el servidor.', 0)
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const message = body?.detail ?? body?.message ?? 'Ocurrió un error inesperado.'
    throw new ApiError(typeof message === 'string' ? message : 'Ocurrió un error inesperado.', res.status)
  }
  return res
}

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const res = await send(path, init)
  return (res.status === 204 ? null : await res.json()) as T
}

const json = (data: unknown) => JSON.stringify(data)

export const httpApi: ApiClient = {
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: json({ username, password }) }),
  register: (input) => request('/auth/register', { method: 'POST', body: json(input) }),
  me: (token) => request('/auth/me', { token }),

  listGroups: (token) => request('/teacher/groups', { token }),
  createGroup: (token, name) => request('/teacher/groups', { method: 'POST', body: json({ name }), token }),
  renameGroup: (token, groupId, name) =>
    request(`/teacher/groups/${groupId}`, { method: 'PATCH', body: json({ name }), token }),
  deleteGroup: (token, groupId) => request(`/teacher/groups/${groupId}`, { method: 'DELETE', token }),
  regenerateJoinCode: (token, groupId) => request(`/teacher/groups/${groupId}/join-code`, { method: 'POST', token }),
  getGroupOverview: (token, groupId) => request(`/teacher/groups/${groupId}`, { token }),
  removeStudent: (token, groupId, studentId) =>
    request(`/teacher/groups/${groupId}/students/${studentId}`, { method: 'DELETE', token }),
  moveStudent: (token, groupId, studentId, targetGroupId) =>
    request(`/teacher/groups/${groupId}/students/${studentId}/move`, {
      method: 'POST',
      body: json({ group_id: targetGroupId }),
      token,
    }),

  getAssignmentOverview: (token, assignmentId) => request(`/teacher/assignments/${assignmentId}`, { token }),
  createAssignment: (token, input) =>
    request('/teacher/assignments', { method: 'POST', body: json(input), token }),
  updateAssignment: (token, assignmentId, changes) =>
    request(`/teacher/assignments/${assignmentId}`, { method: 'PATCH', body: json(changes), token }),
  getEssayReview: (token, assignmentId, studentId) =>
    request(`/teacher/assignments/${assignmentId}/essays/${studentId}`, { token }),
  gradeEssay: (token, essayId, grade, feedback) =>
    request(`/teacher/essays/${encodeURIComponent(essayId)}/grade`, {
      method: 'POST',
      body: json({ grade, feedback }),
      token,
    }),

  listDocuments: (token, assignmentId) => request(`/teacher/assignments/${assignmentId}/documents`, { token }),
  uploadDocuments: (token, assignmentId, files) => {
    const form = new FormData()
    files.forEach((file) => form.append('files', file))
    return request(`/teacher/assignments/${assignmentId}/documents`, { method: 'POST', body: form, token })
  },
  deleteDocument: (token, documentId) =>
    request(`/teacher/documents/${encodeURIComponent(documentId)}`, { method: 'DELETE', token }),
  getDocumentFile: async (token, documentId) =>
    (await send(`/documents/${encodeURIComponent(documentId)}/file`, { token })).blob(),

  getStudentGroups: (token) => request('/student/groups', { token }),
  joinGroup: (token, code) => request('/student/groups/join', { method: 'POST', body: json({ code }), token }),
  getStudentAssignments: (token) => request('/student/assignments', { token }),
  getStudentAssignment: (token, assignmentId) => request(`/student/assignments/${assignmentId}`, { token }),
  saveDraft: (token, assignmentId, draft) =>
    request(`/student/assignments/${assignmentId}/essay`, { method: 'PUT', body: json(draft), token }),
  submitEssay: (token, assignmentId) =>
    request(`/student/assignments/${assignmentId}/submit`, { method: 'POST', token }),

  listTeachers: (token) => request('/admin/teachers', { token }),
  createTeacher: (token, input) => request('/admin/teachers', { method: 'POST', body: json(input), token }),
  updateTeacher: (token, teacherId, changes) =>
    request(`/admin/teachers/${teacherId}`, { method: 'PATCH', body: json(changes), token }),
  deleteTeacher: (token, teacherId) => request(`/admin/teachers/${teacherId}`, { method: 'DELETE', token }),
}
