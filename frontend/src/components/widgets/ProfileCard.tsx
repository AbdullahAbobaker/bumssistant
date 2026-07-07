import { useEffect, useState } from 'react'
import './ProfileCard.css'
import { getMe } from '../../api'

export function ProfileCard() {
  const [name, setName] = useState('')

  useEffect(() => {
    let cancelled = false
    getMe()
      .then(me => { if (!cancelled) setName(me.display_name) })
      .catch(() => { /* sidebar stays quiet on error */ })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="profile-card glass">
      <div className="profile-avatar-large">{name ? name[0].toUpperCase() : '·'}</div>
      <div className="profile-info">
        <div className="profile-name">{name || '…'}</div>
        <div className="profile-role">Nutzerprofil</div>
      </div>
    </div>
  )
}
