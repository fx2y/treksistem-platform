'use client'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { Loader2 } from 'lucide-react'

interface LoginButtonProps {
  className?: string
  children?: React.ReactNode
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

export function LoginButton({ 
  className, 
  children, 
  variant = 'default', 
  size = 'default' 
}: LoginButtonProps) {
  const { login, isLoading } = useAuth()

  return (
    <Button
      onClick={login}
      disabled={isLoading}
      variant={variant}
      size={size}
      className={className}
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Signing in...
        </>
      ) : (
        children || 'Sign in with Google'
      )}
    </Button>
  )
}

export default LoginButton