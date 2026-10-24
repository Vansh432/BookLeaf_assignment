import { useState } from 'react'

// Wraps a write request: tracks pending/error state and resolves to the result, or null on failure.
const useAction = (action) => {
  const [state, setState] = useState({ isPending: false, error: null })

  const run = async (...args) => {
    setState({ isPending: true, error: null })
    try {
      const result = await action(...args)
      setState({ isPending: false, error: null })
      return result
    } catch (error) {
      setState({ isPending: false, error })
      return null
    }
  }

  return { ...state, run }
}

export default useAction
