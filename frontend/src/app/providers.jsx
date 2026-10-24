import { AuthProvider } from '../modules/auth/index.js'

function AppProviders({ children }) {
  return <AuthProvider>{children}</AuthProvider>
}

export default AppProviders
