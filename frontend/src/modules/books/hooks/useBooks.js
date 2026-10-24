import useApiQuery from '../../../shared/hooks/useApiQuery.js'
import { getBooks } from '../services/book.service.js'

// Authors have a handful of books, so one page at the API maximum covers the whole catalogue.
const AUTHOR_PAGE_SIZE = 100

const useBooks = () => useApiQuery(() => getBooks({ limit: AUTHOR_PAGE_SIZE }), 'books')

export default useBooks
