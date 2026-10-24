import Icon from '../ui/Icon.jsx'

function EmptyState({ icon = 'inbox', title, description, action }) {
  return (
    <div className="animate-fade-in rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
        <Icon name={icon} className="size-7" />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-slate-900">{title}</h2>
      {description && <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export default EmptyState
