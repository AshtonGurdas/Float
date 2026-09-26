export const CARRIERS = [
  { id: 'canada-post', label: 'Canada Post' },
  { id: 'ups', label: 'UPS' },
  { id: 'fedex', label: 'FedEx' },
  { id: 'usps', label: 'USPS' },
  { id: 'purolator', label: 'Purolator' },
  { id: 'dhl', label: 'DHL' },
  { id: 'other', label: 'Other' },
]

export function guessCarrier(number) {
  const raw = String(number || '').replace(/\s+/g, '')
  if (!raw) return 'other'
  if (/^1Z/i.test(raw)) return 'ups'
  if (/^[A-Z]{2}\d{9}CA$/i.test(raw)) return 'canada-post'
  if (/^(94|93|92|91)\d{18,}$/.test(raw)) return 'usps'
  if (/^\d{16}$/.test(raw)) return 'canada-post'
  if (/^\d{12}$/.test(raw) || /^\d{15}$/.test(raw) || /^\d{20}$/.test(raw) || /^\d{22}$/.test(raw)) return 'fedex'
  return 'other'
}

export function carrierLabel(id) {
  return CARRIERS.find((carrier) => carrier.id === id)?.label || 'Carrier'
}

export function trackingUrl(carrier, number) {
  const clean = String(number || '').trim()
  if (!clean) return ''
  const encoded = encodeURIComponent(clean)
  if (carrier === 'canada-post') return `https://www.canadapost-postescanada.ca/track-reperage/en#/details/${encoded}`
  if (carrier === 'ups') return `https://www.ups.com/track?tracknum=${encoded}`
  if (carrier === 'fedex') return `https://www.fedex.com/fedextrack/?trknbr=${encoded}`
  if (carrier === 'usps') return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encoded}`
  if (carrier === 'purolator') return `https://www.purolator.com/en/shipping/tracker?pin=${encoded}`
  if (carrier === 'dhl') return `https://www.dhl.com/ca-en/home/tracking.html?tracking-id=${encoded}`
  return `https://www.17track.net/en/track?nums=${encoded}`
}
