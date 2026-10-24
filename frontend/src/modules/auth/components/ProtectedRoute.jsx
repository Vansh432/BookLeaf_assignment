import { Navigate, Outlet, useLocation } from 'react-router'
import PageLoader from '../../../shared/components/feedback/PageLoader.jsx'
import useAuth from '../hooks/useAuth.js'

function ProtectedRoute() {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <PageLoader />
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}

export default ProtectedRoute
