import { createBrowserRouter } from 'react-router'
import PortalLayout from '../layouts/PortalLayout.jsx'
import NotFoundPage from '../shared/components/feedback/NotFoundPage.jsx'

const router = createBrowserRouter([
  {
    path: '/',
    element: <PortalLayout />,
    children: [],
  },
  { path: '*', element: <NotFoundPage /> },
])

export default router
