export type Route =
  | { name: 'books' }
  | { name: 'market' }
  | { name: 'inventory' }
  | { name: 'shops' }
  | { name: 'events' }
  | { name: 'product'; productId: number; subtype: string | null }

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/'
  const [path, query = ''] = raw.split('?')
  const params = new URLSearchParams(query)
  const parts = path.split('/').filter(Boolean)
  if (parts[0] === 'market') return { name: 'market' }
  if (parts[0] === 'inventory') return { name: 'inventory' }
  if (parts[0] === 'shops') return { name: 'shops' }
  if (parts[0] === 'events') return { name: 'events' }
  if (parts[0] === 'product' && parts[1] && Number.isInteger(Number(parts[1]))) {
    return { name: 'product', productId: Number(parts[1]), subtype: params.get('sub') }
  }
  return { name: 'books' }
}

export function sectionOf(route: Route) {
  if (route.name === 'inventory') return 'inventory'
  if (route.name === 'shops') return 'shops'
  if (route.name === 'events') return 'events'
  if (route.name === 'market' || route.name === 'product') return 'market'
  return 'books'
}
