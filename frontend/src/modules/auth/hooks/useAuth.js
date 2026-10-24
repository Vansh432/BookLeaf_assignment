import { use } from 'react'
import { AuthContext } from '../context/AuthContext.js'

const useAuth = () => {
  const context = use(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return context
}

export default useAuth
