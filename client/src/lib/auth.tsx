import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface AuthUser {
  nickname: string
  token: string
}

interface AuthContextType {
  user: AuthUser | null
  login: (nickname: string, token: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem('wp_user')
      return stored ? JSON.parse(stored) : null
    } catch { return null }
  })

  function login(nickname: string, token: string) {
    const u = { nickname, token }
    setUser(u)
    localStorage.setItem('wp_user', JSON.stringify(u))
  }

  function logout() {
    setUser(null)
    localStorage.removeItem('wp_user')
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
