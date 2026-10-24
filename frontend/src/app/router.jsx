import { createBrowserRouter } from 'react-router'
import PortalLayout from '../layouts/PortalLayout.jsx'
import { LoginPage, ProtectedRoute, RoleRoute } from '../modules/auth/index.js'
import HomePage from '../modules/dashboard/pages/HomePage.jsx'
import NotFoundPage from '../shared/components/feedback/NotFoundPage.jsx'
import { ROLES } from '../shared/constants/app.js'

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <PortalLayout />,
        children: [
          { index: true, element: <HomePage /> },
          {
            element: <RoleRoute allowedRoles={[ROLES.AUTHOR]} />,
            children: [],
          },
          {
            path: 'admin',
            element: <RoleRoute allowedRoles={[ROLES.ADMIN]} />,
            children: [],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])

export default router
