'use client'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { LogOut, Loader2 } from 'lucide-react'

interface LogoutButtonProps {
  className?: string
  children?: React.ReactNode
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  showIcon?: boolean
}

export function LogoutButton({ 
  className, 
  children, 
  variant = 'outline', 
  size = 'default',
  showIcon = true
}: LogoutButtonProps) {
  const { logout, isLoading } = useAuth()

  const handleLogout = async () => {
    await logout()
  }

  return (
    <Button
      onClick={handleLogout}
      disabled={isLoading}
      variant={variant}
      size={size}
      className={className}
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Signing out...
        </>
      ) : (
        <>
          {showIcon && <LogOut className="mr-2 h-4 w-4" />}
          {children || 'Sign out'}
        </>
      )}
    </Button>
  )
}

export default LogoutButton