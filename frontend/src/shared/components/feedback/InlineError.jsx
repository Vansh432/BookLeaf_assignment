import Icon from '../ui/Icon.jsx'

// Renders an API error ({ message, errors }) next to the form or action that caused it.
function InlineError({ error }) {
  if (!error) {
    return null
  }

  return (
    <div role="alert" className="flex gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
      <Icon name="alert" className="mt-0.5 size-5 shrink-0" />
      <div>
        <p className="font-semibold">{error.message}</p>
        {error.errors?.length > 0 && (
          <ul className="mt-1 list-disc pl-4">
            {error.errors.map((fieldError) => (
              <li key={`${fieldError.field}-${fieldError.message}`}>{fieldError.message}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default InlineError
