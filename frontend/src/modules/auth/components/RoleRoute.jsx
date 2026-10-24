import { Navigate, Outlet } from 'react-router'
import useAuth from '../hooks/useAuth.js'

// UI-level guard only; the API enforces the same roles on every request.
function RoleRoute({ allowedRoles }) {
  const { user } = useAuth()

  if (!allowedRoles.includes(user?.role)) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

export default RoleRoute
