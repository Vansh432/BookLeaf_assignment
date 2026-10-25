import { createBrowserRouter } from 'react-router'
import PortalLayout from '../layouts/PortalLayout.jsx'
import { AiUsagePage } from '../modules/analytics/index.js'
import { AuthorDetailPage, AuthorsPage } from '../modules/authors/index.js'
import { LoginPage, ProtectedRoute, RoleRoute } from '../modules/auth/index.js'
import { MyBooksPage } from '../modules/books/index.js'
import HomePage from '../modules/dashboard/pages/HomePage.jsx'
import {
  AdminTicketPage,
  MyTicketsPage,
  NewTicketPage,
  TicketDetailPage,
  TicketQueuePage,
} from '../modules/tickets/index.js'
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
            children: [
              { path: 'books', element: <MyBooksPage /> },
              { path: 'tickets', element: <MyTicketsPage /> },
              { path: 'tickets/new', element: <NewTicketPage /> },
              { path: 'tickets/:ticketId', element: <TicketDetailPage /> },
            ],
          },
          {
            path: 'admin',
            element: <RoleRoute allowedRoles={[ROLES.ADMIN]} />,
            children: [
              { path: 'tickets', element: <TicketQueuePage /> },
              { path: 'tickets/:ticketId', element: <AdminTicketPage /> },
              { path: 'authors', element: <AuthorsPage /> },
              { path: 'authors/:authorId', element: <AuthorDetailPage /> },
              { path: 'ai-usage', element: <AiUsagePage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])

export default router
