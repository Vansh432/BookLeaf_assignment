import Icon from './Icon.jsx'

const TONES = {
  light: { mark: 'bg-white/10 text-brand-200 ring-white/15', text: 'text-white' },
  dark: { mark: 'bg-brand-600 text-white ring-brand-700/10', text: 'text-slate-900' },
}

function Logo({ tone = 'dark' }) {
  const styles = TONES[tone]

  return (
    <span className="inline-flex items-center gap-2.5">
      <span className={`grid size-9 place-items-center rounded-xl ring-1 ${styles.mark}`}>
        <Icon name="leaf" className="size-5" strokeWidth={2} />
      </span>
      <span className={`text-lg font-extrabold tracking-tight ${styles.text}`}>
        Book<span className="text-brand-400">Leaf</span>
      </span>
    </span>
  )
}

export default Logo
