const COVER_GRADIENTS = [
  'from-brand-800 to-brand-400',
  'from-indigo-800 to-sky-400',
  'from-rose-800 to-amber-400',
  'from-violet-800 to-fuchsia-400',
  'from-slate-900 to-slate-500',
  'from-amber-700 to-yellow-400',
]

// The same title always gets the same colours, so each book has a recognisable cover.
const pickGradient = (title) => {
  const hash = [...title].reduce((sum, character) => sum + character.charCodeAt(0), 0)
  return COVER_GRADIENTS[hash % COVER_GRADIENTS.length]
}

function BookCover({ title }) {
  return (
    <div
      className={`relative flex h-36 w-24 shrink-0 flex-col justify-between overflow-hidden rounded-r-lg rounded-l-sm bg-linear-to-br p-3 shadow-lg shadow-slate-900/20 ${pickGradient(title)}`}
      aria-hidden="true"
    >
      <span className="absolute inset-y-0 left-1.5 w-px bg-white/30" />
      <span className="absolute -top-6 -right-6 size-16 rounded-full bg-white/15" />
      <p className="relative line-clamp-4 pl-1 text-[11px] leading-tight font-bold text-white">{title}</p>
      <p className="relative pl-1 text-[9px] font-semibold tracking-widest text-white/70 uppercase">BookLeaf</p>
    </div>
  )
}

export default BookCover
