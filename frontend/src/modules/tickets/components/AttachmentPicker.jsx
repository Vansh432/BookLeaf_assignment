import { useId } from 'react'
import Icon from '../../../shared/components/ui/Icon.jsx'

const MAX_FILES = 3
const MAX_FILE_SIZE_MB = 5
const ACCEPTED_TYPES = '.jpg,.jpeg,.png,.pdf'

// UI only (per the brief): files are listed so the author can see what they would share,
// but they are not uploaded with the ticket.
function AttachmentPicker({ files, onChange }) {
  const inputId = useId()

  const handleSelect = (event) => {
    const selected = [...event.target.files].filter((file) => file.size <= MAX_FILE_SIZE_MB * 1024 * 1024)
    onChange([...files, ...selected].slice(0, MAX_FILES))
    event.target.value = ''
  }

  return (
    <div className="space-y-2">
      <label
        htmlFor={inputId}
        className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center transition hover:border-brand-300 hover:bg-brand-50/40"
      >
        <span className="grid size-10 place-items-center rounded-xl bg-white text-brand-600 shadow-sm ring-1 ring-slate-200">
          <Icon name="paperclip" className="size-5" />
        </span>
        <span className="text-sm font-semibold text-slate-700">Attach screenshots or photos</span>
        <span className="text-xs text-slate-500">
          JPG, PNG or PDF · up to {MAX_FILES} files, {MAX_FILE_SIZE_MB} MB each · e.g. photos of a misprinted copy
        </span>
      </label>
      <input id={inputId} type="file" multiple accept={ACCEPTED_TYPES} onChange={handleSelect} className="sr-only" />

      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.lastModified}`}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200"
            >
              <Icon name="paperclip" className="size-3.5 text-slate-400" />
              {file.name}
              <button
                type="button"
                onClick={() => onChange(files.filter((_, fileIndex) => fileIndex !== index))}
                className="text-slate-400 hover:text-red-600"
                aria-label={`Remove ${file.name}`}
              >
                <Icon name="close" className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default AttachmentPicker
