import { useAuth } from '../../auth/index.js'
import { ROLES } from '../../../shared/constants/app.js'

const ROLE_INTRO = {
  [ROLES.AUTHOR]: 'Track your books and royalties, and reach the BookLeaf team when you need help.',
  [ROLES.ADMIN]: 'Review incoming author queries and respond with AI-assisted drafts.',
}

function HomePage() {
  const { user } = useAuth()

  return (
    <section className="space-y-1">
      <h1 className="text-2xl font-semibold">Welcome, {user.name}</h1>
      <p className="text-slate-600">{ROLE_INTRO[user.role]}</p>
    </section>
  )
}

export default HomePage
