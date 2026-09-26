export const CARRIERS: { id: string; label: string }[]
export function guessCarrier(number: string): string
export function carrierLabel(id: string | null | undefined): string
export function trackingUrl(carrier: string | null | undefined, number: string | null | undefined): string
