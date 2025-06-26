'use client'

import { useEffect } from 'react'
import { initializeSecurity } from '@/utils/security'

export function SecurityInitializer() {
  useEffect(() => {
    // Initialize security features
    initializeSecurity({
      disableConsole: process.env.NODE_ENV === 'production',
      preventDevTools: false, // Can be enabled for high-security environments
      disableContextMenu: false, // Can be enabled if needed
      disableTextSelection: false, // Can be enabled if needed
      addSecurityMeta: true
    })
  }, [])

  // This component doesn't render anything
  return null
}

export default SecurityInitializer