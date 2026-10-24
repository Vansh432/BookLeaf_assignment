import { useEffect, useId, useRef, useState } from 'react'
import { getInitials } from '../../utils/format.js'
import Icon from '../ui/Icon.jsx'

// Styled, keyboard-accessible replacement for <select> (the native popup cannot be styled).
// Options: { value, label, description?, avatar?: boolean, dot?: tailwind bg class }.
// The empty value represents "no filter" and is shown as `placeholder`.
function SelectMenu({ label, value, options, placeholder, onChange, searchable = false, searchPlaceholder = 'Search…' }) {
  const listId = useId()
  const containerRef = useRef(null)
  const triggerRef = useRef(null)
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const allOptions = [{ value: '', label: placeholder }, ...options]
  const normalizedQuery = query.trim().toLowerCase()
  const visibleOptions = normalizedQuery
    ? allOptions.filter((option) => `${option.label} ${option.description ?? ''}`.toLowerCase().includes(normalizedQuery))
    : allOptions
  const selected = allOptions.find((option) => option.value === value) ?? allOptions[0]
  const hasValue = Boolean(value)

  const open = () => {
    setQuery('')
    setActiveIndex(Math.max(allOptions.indexOf(selected), 0))
    setIsOpen(true)
  }

  const close = () => {
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  const choose = (option) => {
    onChange(option.value)
    close()
  }

  // Close when clicking anywhere outside the menu.
  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isOpen])

  // Keep the keyboard-highlighted option visible while scrolling through a long list.
  useEffect(() => {
    if (isOpen) {
      document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex, isOpen, listId])

  const handleKeyDown = (event) => {
    if (!isOpen) {
      if (['ArrowDown', 'Enter', ' '].includes(event.key)) {
        event.preventDefault()
        open()
      }
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((index) => (index + step + visibleOptions.length) % visibleOptions.length)
    } else if (event.key === 'Enter' && visibleOptions[activeIndex]) {
      event.preventDefault()
      choose(visibleOptions[activeIndex])
    } else if (event.key === 'Escape') {
      close()
    } else if (event.key === 'Tab') {
      // Let focus move on naturally instead of returning it to the trigger.
      setIsOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative min-w-44 flex-1" onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (isOpen ? close() : open())}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`${label}: ${selected.label}`}
        className={`flex w-full items-center gap-2 rounded-xl border px-3.5 py-2.5 text-left text-sm transition focus:ring-4 focus:ring-brand-100 focus:outline-none ${
          hasValue
            ? 'border-brand-300 bg-brand-50/60 font-semibold text-brand-800'
            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
        } ${isOpen ? 'border-brand-500 ring-4 ring-brand-100' : ''}`}
      >
        {selected.dot && <span className={`size-2 shrink-0 rounded-full ${selected.dot}`} />}
        <span className="min-w-0 flex-1 truncate">{selected.label}</span>
        <Icon name="chevronDown" className={`size-4 shrink-0 text-slate-400 transition ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 z-30 mt-2 w-full min-w-72 animate-fade-in rounded-2xl bg-white p-1.5 shadow-2xl ring-1 shadow-slate-900/10 ring-slate-200">
          {searchable && (
            <div className="relative mb-1.5">
              <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setActiveIndex(0)
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                aria-controls={listId}
                className="w-full rounded-xl border-0 bg-slate-100/80 py-2 pr-3 pl-9 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-brand-200 focus:outline-none"
              />
            </div>
          )}

          <ul id={listId} role="listbox" aria-label={label} className="max-h-72 overflow-y-auto">
            {visibleOptions.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-400">No matches</li>}
            {visibleOptions.map((option, index) => {
              const isSelected = option.value === value
              const isActive = index === activeIndex
              return (
                <li
                  key={option.value || 'all'}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(option)}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                    isActive ? 'bg-slate-100' : ''
                  } ${isSelected ? 'font-semibold text-brand-700' : 'text-slate-700'}`}
                >
                  {option.avatar && (
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-linear-to-br from-brand-100 to-brand-200 text-[11px] font-bold text-brand-800">
                      {getInitials(option.label)}
                    </span>
                  )}
                  {option.dot && <span className={`size-2.5 shrink-0 rounded-full ${option.dot}`} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{option.label}</span>
                    {option.description && <span className="block truncate text-xs font-normal text-slate-400">{option.description}</span>}
                  </span>
                  {isSelected && <Icon name="check" className="size-4 shrink-0 text-brand-600" strokeWidth={2.5} />}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

export default SelectMenu
