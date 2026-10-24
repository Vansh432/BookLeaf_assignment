import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import InlineError from '../../../shared/components/feedback/InlineError.jsx'
import { INPUT_CLASS, LABEL_CLASS, SELECT_CLASS } from '../../../shared/components/forms/fieldStyles.js'
import Button from '../../../shared/components/ui/Button.jsx'
import Icon from '../../../shared/components/ui/Icon.jsx'
import useAction from '../../../shared/hooks/useAction.js'
import { useBooks } from '../../books/index.js'
import AttachmentPicker from '../components/AttachmentPicker.jsx'
import { GENERAL_QUERY_LABEL } from '../constants.js'
import { createTicket } from '../services/ticket.service.js'

const SUBJECT_MAX = 150
const DESCRIPTION_MIN = 20
const DESCRIPTION_MAX = 5000

const TIPS = [
  'Mention the platform (Amazon, Flipkart…) if your question is about a listing.',
  'For royalty questions, include the period or payout you are asking about.',
  'For print issues, attach photos of the affected pages.',
]

function NewTicketPage() {
  const navigate = useNavigate()
  const { data: booksData, isLoading: isLoadingBooks } = useBooks()
  const [form, setForm] = useState({ bookId: '', subject: '', description: '' })
  const [attachments, setAttachments] = useState([])
  const { run: submit, isPending, error } = useAction(createTicket)

  const handleChange = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const ticket = await submit({ ...form, bookId: form.bookId || null })
    if (ticket) {
      navigate(`/tickets/${ticket.id}`, { replace: true })
    }
  }

  return (
    <section className="space-y-6">
      <header>
        <Link to="/tickets" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
          <Icon name="arrowLeft" className="size-4" />
          My Tickets
        </Link>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">Raise a query</h1>
        <p className="mt-1 text-sm text-slate-500">Tell us what you need help with. Our team typically responds within 24–48 hours.</p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-slate-200/70 bg-white p-6 shadow-card">
          <div className="space-y-1.5">
            <label htmlFor="bookId" className={LABEL_CLASS}>
              Which book is this about?
            </label>
            <select
              id="bookId"
              name="bookId"
              value={form.bookId}
              onChange={handleChange}
              disabled={isLoadingBooks}
              className={SELECT_CLASS}
            >
              <option value="">{GENERAL_QUERY_LABEL}</option>
              {booksData?.books.map((book) => (
                <option key={book.id} value={book.id}>
                  {book.title}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="subject" className={LABEL_CLASS}>
              Subject
            </label>
            <input
              id="subject"
              name="subject"
              required
              minLength={5}
              maxLength={SUBJECT_MAX}
              placeholder="e.g. Royalty for last quarter not received"
              value={form.subject}
              onChange={handleChange}
              className={INPUT_CLASS}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <label htmlFor="description" className={LABEL_CLASS}>
                Details
              </label>
              <span className="text-xs text-slate-400">
                {form.description.length}/{DESCRIPTION_MAX}
              </span>
            </div>
            <textarea
              id="description"
              name="description"
              required
              rows={7}
              minLength={DESCRIPTION_MIN}
              maxLength={DESCRIPTION_MAX}
              placeholder="Describe the issue, including any dates, amounts or order numbers that will help us."
              value={form.description}
              onChange={handleChange}
              className={`${INPUT_CLASS} resize-y`}
            />
          </div>

          <div className="space-y-1.5">
            <p className={LABEL_CLASS}>
              Attachments <span className="font-normal text-slate-400">(optional)</span>
            </p>
            <AttachmentPicker files={attachments} onChange={setAttachments} />
          </div>

          <InlineError error={error} />

          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5">
            <Link to="/tickets" className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">
              Cancel
            </Link>
            <Button type="submit" icon="send" isLoading={isPending}>
              Submit query
            </Button>
          </div>
        </form>

        <aside className="h-fit rounded-2xl bg-linear-to-br from-brand-900 to-brand-700 p-6 text-white shadow-lg shadow-brand-900/20">
          <span className="grid size-10 place-items-center rounded-xl bg-white/15">
            <Icon name="sparkles" className="size-5" />
          </span>
          <h2 className="mt-4 font-bold">Get a faster answer</h2>
          <ul className="mt-3 space-y-3 text-sm text-brand-50/85">
            {TIPS.map((tip) => (
              <li key={tip} className="flex gap-2">
                <Icon name="checkCircle" className="mt-0.5 size-4 shrink-0 text-brand-300" />
                {tip}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  )
}

export default NewTicketPage
