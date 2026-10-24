import { useEffect, useRef, useState } from 'react'

// Fetches with `queryFn` whenever `queryKey` changes (or `reload` is called).
// The previous data stays visible while a new request is in flight, so filters do not flash.
const useApiQuery = (queryFn, queryKey) => {
  const queryFnRef = useRef(queryFn)
  const [reloadCount, setReloadCount] = useState(0)
  const [result, setResult] = useState({ key: null, data: null, error: null })
  const requestKey = `${queryKey}#${reloadCount}`

  useEffect(() => {
    queryFnRef.current = queryFn
  })

  useEffect(() => {
    let isActive = true

    queryFnRef
      .current()
      .then((data) => isActive && setResult({ key: requestKey, data, error: null }))
      .catch((error) => isActive && setResult((current) => ({ key: requestKey, data: current.data, error })))

    return () => {
      isActive = false
    }
  }, [requestKey])

  return {
    data: result.data,
    error: result.error,
    isLoading: result.key !== requestKey,
    reload: () => setReloadCount((count) => count + 1),
    // Lets a mutation drop its fresh server response straight into the cache.
    setData: (data) => setResult((current) => ({ ...current, data })),
  }
}

export default useApiQuery
