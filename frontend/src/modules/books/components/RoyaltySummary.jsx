import Icon from '../../../shared/components/ui/Icon.jsx'
import { formatCurrency, formatNumber } from '../../../shared/utils/format.js'

function StatCard({ icon, label, value, caption, iconClass }) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-card">
      <span className={`grid size-10 place-items-center rounded-xl ${iconClass}`}>
        <Icon name={icon} className="size-5" />
      </span>
      <p className="mt-4 text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{caption}</p>
    </div>
  )
}

// paidCaption lets the admin view describe the author in the third person.
function RoyaltySummary({ summary, paidCaption = 'Transferred to your bank' }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        icon="trendingUp"
        label="Copies sold"
        value={formatNumber(summary.totalCopiesSold)}
        caption={`Across ${summary.totalBooks} ${summary.totalBooks === 1 ? 'title' : 'titles'}`}
        iconClass="bg-sky-50 text-sky-600"
      />
      <StatCard
        icon="wallet"
        label="Royalty earned"
        value={formatCurrency(summary.totalRoyaltyEarned)}
        caption="Lifetime, all platforms"
        iconClass="bg-violet-50 text-violet-600"
      />
      <StatCard
        icon="checkCircle"
        label="Royalty paid"
        value={formatCurrency(summary.totalRoyaltyPaid)}
        caption={paidCaption}
        iconClass="bg-emerald-50 text-emerald-600"
      />

      <div className="relative overflow-hidden rounded-2xl bg-linear-to-br from-brand-700 via-brand-600 to-brand-500 p-5 text-white shadow-lg shadow-brand-700/25">
        <span className="pointer-events-none absolute -top-8 -right-8 size-28 rounded-full bg-white/10" />
        <span className="relative grid size-10 place-items-center rounded-xl bg-white/15">
          <Icon name="clock" className="size-5" />
        </span>
        <p className="relative mt-4 text-sm font-medium text-brand-50/90">Royalty pending</p>
        <p className="relative mt-1 text-2xl font-extrabold tracking-tight">
          {formatCurrency(summary.totalRoyaltyPending)}
        </p>
        <p className="relative mt-1 text-xs text-brand-50/80">Paid out quarterly, once above ₹1,000</p>
      </div>
    </div>
  )
}

export default RoyaltySummary
