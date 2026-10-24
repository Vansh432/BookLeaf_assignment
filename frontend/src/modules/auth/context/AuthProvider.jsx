import { useEffect, useState } from 'react'
import { onSessionExpired } from '../../../shared/services/api.js'
import * as authService from '../services/auth.service.js'
import { AuthContext } from './AuthContext.js'

function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  // Restores the session from the httpOnly cookies on first load.
  useEffect(() => {
    let isMounted = true
    onSessionExpired(() => setUser(null))

    authService
      .getCurrentUser()
      .then((currentUser) => isMounted && setUser(currentUser))
      .catch(() => isMounted && setUser(null))
      .finally(() => isMounted && setIsLoading(false))

    return () => {
      isMounted = false
      onSessionExpired(null)
    }
  }, [])

  const login = async (credentials) => {
    const signedInUser = await authService.login(credentials)
    setUser(signedInUser)
    return signedInUser
  }

  const logout = async () => {
    try {
      await authService.logout()
    } finally {
      setUser(null)
    }
  }

  return <AuthContext value={{ user, isLoading, login, logout }}>{children}</AuthContext>
}

export default AuthProvider
