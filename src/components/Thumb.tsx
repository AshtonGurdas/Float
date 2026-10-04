import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { imageLarge } from '../lib/market.ts'

function isPackTile(src: string) {
  return /onepiece-cardgame\.com/i.test(src) && /img_item/i.test(src)
}

export function Thumb({ src, name, large = false }: { src: string | null; name: string; large?: boolean }) {
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const letter = (name || '?').trim().slice(0, 1).toUpperCase() || '?'
  if (!src || failed) return <span className={large ? 'thumb thumb-lg letter' : 'thumb letter'}>{letter}</span>
  const pack = isPackTile(src)
  return (
    <>
      <button
        type="button"
        className={['thumb-btn', large ? 'lg' : '', pack ? 'pack' : ''].filter(Boolean).join(' ')}
        aria-label={`View a larger photo of ${name}`}
        onClick={(event) => {
          event.stopPropagation()
          setOpen(true)
        }}
      >
        {pack ? (
          <span className="pack-window">
            <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
          </span>
        ) : (
          <img
            className={large ? 'thumb thumb-lg' : 'thumb'}
            src={src}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        )}
      </button>
      {open ? <Photo src={src} name={name} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function Photo({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  const large = imageLarge(src) || src
  const [current, setCurrent] = useState(large)
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  const pack = isPackTile(current)
  return createPortal(
    <div className="backdrop photo-backdrop" onClick={onClose} role="presentation">
      <div className="photo-frame" role="dialog" aria-modal="true" aria-label={name} onClick={(event) => event.stopPropagation()}>
        {pack ? (
          <div className="photo-pack">
            <img
              src={current}
              alt={name}
              referrerPolicy="no-referrer"
              onError={() => {
                if (current !== src) setCurrent(src)
              }}
            />
          </div>
        ) : (
          <img
            src={current}
            alt={name}
            referrerPolicy="no-referrer"
            onError={() => {
              if (current !== src) setCurrent(src)
            }}
          />
        )}
        <button type="button" className="btn ghost" onClick={onClose} autoFocus>Close</button>
      </div>
    </div>,
    document.body,
  )
}
