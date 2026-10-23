import { Outlet } from 'react-router'
import { PORTAL_NAME } from '../shared/constants/app.js'

function PortalLayout() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4">
          <span className="text-lg font-semibold text-brand-600">{PORTAL_NAME}</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}

export default PortalLayout
