import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect, type ReactNode } from 'react'
import { useAuth } from './auth/AuthContext'
import type { Role } from './api'
import { FullPageSpinner } from './components/ui'
import AppLayout from './components/AppLayout'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import AdminTeachersPage from './pages/admin/AdminTeachersPage'
import GroupsPage from './pages/teacher/GroupsPage'
import GroupPage from './pages/teacher/GroupPage'
import GroupStudentsPage from './pages/teacher/GroupStudentsPage'
import StudentSubmissionsPage from './pages/teacher/StudentSubmissionsPage'
import GroupAssignmentsPage from './pages/teacher/GroupAssignmentsPage'
import AssignmentDetail from './pages/teacher/AssignmentDetail'
import EssayReviewPage from './pages/teacher/EssayReviewPage'
import StudentDashboard from './pages/student/StudentDashboard'
import EssayWorkspace from './pages/student/EssayWorkspace'

function homeFor(role: Role) {
  return { admin: '/admin', teacher: '/maestro', student: '/alumno' }[role]
}

function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, ready } = useAuth()
  if (!ready) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== role) return <Navigate to={homeFor(user.role)} replace />
  return <>{children}</>
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  const { user, ready } = useAuth()

  return (
    <>
      <ScrollToTop />
      <Routes>
      <Route
        path="/login"
        element={!ready ? <FullPageSpinner /> : user ? <Navigate to={homeFor(user.role)} replace /> : <LoginPage />}
      />
      <Route
        path="/registro"
        element={!ready ? <FullPageSpinner /> : user ? <Navigate to={homeFor(user.role)} replace /> : <RegisterPage />}
      />
      <Route
        path="/admin"
        element={
          <RequireRole role="admin">
            <AppLayout />
          </RequireRole>
        }
      >
        <Route index element={<AdminTeachersPage />} />
      </Route>
      <Route
        path="/maestro"
        element={
          <RequireRole role="teacher">
            <AppLayout />
          </RequireRole>
        }
      >
        <Route index element={<GroupsPage />} />
        <Route path="grupos/:groupId" element={<GroupPage />} />
        <Route path="grupos/:groupId/alumnos" element={<GroupStudentsPage />} />
        <Route path="grupos/:groupId/alumnos/:studentId" element={<StudentSubmissionsPage />} />
        <Route path="grupos/:groupId/tareas" element={<GroupAssignmentsPage />} />
        <Route path="tareas/:assignmentId" element={<AssignmentDetail />} />
        <Route path="tareas/:assignmentId/alumnos/:studentId" element={<EssayReviewPage />} />
      </Route>
      <Route
        path="/alumno"
        element={
          <RequireRole role="student">
            <AppLayout />
          </RequireRole>
        }
      >
        <Route index element={<StudentDashboard />} />
      </Route>
      <Route
        path="/alumno/ensayo/:assignmentId"
        element={
          <RequireRole role="student">
            <EssayWorkspace />
          </RequireRole>
        }
      />
      <Route
        path="*"
        element={!ready ? <FullPageSpinner /> : <Navigate to={user ? homeFor(user.role) : '/login'} replace />}
      />
      </Routes>
    </>
  )
}
