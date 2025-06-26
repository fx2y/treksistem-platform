'use client'

import { useAuth } from '@/contexts/AuthContext'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle, XCircle, Shield, User } from 'lucide-react'

interface UserProfileProps {
  className?: string
  showRoles?: boolean
  showDetails?: boolean
}

export function UserProfile({ 
  className, 
  showRoles = true, 
  showDetails = true 
}: UserProfileProps) {
  const { user, isAuthenticated } = useAuth()

  if (!isAuthenticated || !user) {
    return null
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'MASTER_ADMIN':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'PARTNER_ADMIN':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'DRIVER':
        return 'bg-green-100 text-green-800 border-green-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'MASTER_ADMIN':
      case 'PARTNER_ADMIN':
        return <Shield className="h-3 w-3 mr-1" />
      case 'DRIVER':
        return <User className="h-3 w-3 mr-1" />
      default:
        return null
    }
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center space-x-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={user.picture} alt={user.name} />
            <AvatarFallback>
              {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-medium text-gray-900 truncate">
              {user.name}
            </CardTitle>
            <div className="flex items-center mt-1">
              <p className="text-sm text-gray-500 truncate">{user.email}</p>
              {user.emailVerified ? (
                <CheckCircle className="ml-2 h-4 w-4 text-green-500 flex-shrink-0" />
              ) : (
                <XCircle className="ml-2 h-4 w-4 text-red-500 flex-shrink-0" />
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      
      {(showRoles || showDetails) && (
        <CardContent className="pt-0">
          {showRoles && user.roles.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-gray-700 mb-2">Roles</p>
              <div className="flex flex-wrap gap-1">
                {user.roles.map((roleObj, index) => (
                  <Badge
                    key={index}
                    variant="outline"
                    className={`text-xs ${getRoleColor(roleObj.role)}`}
                  >
                    {getRoleIcon(roleObj.role)}
                    {roleObj.role.replace('_', ' ').toLowerCase()}
                    {roleObj.contextId && (
                      <span className="ml-1 text-xs opacity-75">
                        ({roleObj.contextId})
                      </span>
                    )}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          {showDetails && (
            <div className="text-xs text-gray-500 space-y-1">
              <div className="flex justify-between">
                <span>Email Verified:</span>
                <span className={user.emailVerified ? 'text-green-600' : 'text-red-600'}>
                  {user.emailVerified ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>User ID:</span>
                <span className="font-mono text-xs">{user.id.slice(0, 12)}...</span>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

// Compact version for headers/navbars
export function UserProfileCompact({ className }: { className?: string }) {
  const { user, isAuthenticated } = useAuth()

  if (!isAuthenticated || !user) {
    return null
  }

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <Avatar className="h-8 w-8">
        <AvatarImage src={user.picture} alt={user.name} />
        <AvatarFallback className="text-xs">
          {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {user.name}
        </p>
        <p className="text-xs text-gray-500 truncate">
          {user.email}
        </p>
      </div>
      {user.emailVerified && (
        <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
      )}
    </div>
  )
}

export default UserProfile