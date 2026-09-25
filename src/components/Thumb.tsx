import { useState } from 'react'

export function Thumb({ src, name, large = false }: { src: string | null; name: string; large?: boolean }) {
  const [failed, setFailed] = useState(false)
  const letter = (name || '?').trim().slice(0, 1).toUpperCase() || '?'
  if (!src || failed) return <span className={large ? 'thumb thumb-lg letter' : 'thumb letter'}>{letter}</span>
  return (
    <img
      className={large ? 'thumb thumb-lg' : 'thumb'}
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  )
}
