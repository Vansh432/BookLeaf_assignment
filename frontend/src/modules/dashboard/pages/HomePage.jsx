import { Navigate } from 'react-router'
import { ROLES } from '../../../shared/constants/app.js'
import { useAuth } from '../../auth/index.js'

const ROLE_HOME_PATHS = {
  [ROLES.AUTHOR]: '/books',
  [ROLES.ADMIN]: '/admin/tickets',
}

// "/" has no page of its own; each role starts on its main workspace.
function HomePage() {
  const { user } = useAuth()
  return <Navigate to={ROLE_HOME_PATHS[user.role]} replace />
}

export default HomePage
