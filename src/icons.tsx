type IconProps = { className?: string }

export function IconBooks({ className = 'icon' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.5 5.5h8.2A3.3 3.3 0 0 1 18 8.8V19H8.2A2.7 2.7 0 0 0 6.5 19.2V5.5Z" />
      <path d="M6.5 5.5h8.2A3.3 3.3 0 0 1 18 8.8H8.4" />
    </svg>
  )
}

export function IconMarket({ className = 'icon' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 16.5 9 11l3.2 3.2L20 7" />
      <path d="M14.5 7H20v5.5" />
    </svg>
  )
}

export function IconStock({ className = 'icon' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 8.5 12 4.5l7.5 4v9L12 21.5l-7.5-4v-9Z" />
      <path d="M12 12.5 4.5 8.5M12 12.5 19.5 8.5M12 12.5V21" />
    </svg>
  )
}

export function IconPlus({ className = 'icon' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5.5v13M5.5 12h13" />
    </svg>
  )
}
