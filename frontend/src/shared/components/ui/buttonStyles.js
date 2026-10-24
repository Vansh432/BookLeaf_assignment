const VARIANTS = {
  primary: 'bg-brand-600 text-white shadow-sm shadow-brand-600/20 hover:bg-brand-700',
  secondary: 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
  dark: 'bg-slate-900 text-white hover:bg-slate-700',
}

// Shared by <Button> and by <Link>s that should look like buttons.
export const buttonClass = (variant = 'primary', className = '') =>
  `inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${className}`
