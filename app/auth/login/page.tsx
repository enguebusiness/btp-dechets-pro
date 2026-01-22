'use client'

import { supabase } from '@/lib/supabase' // ou ton import
import { useState } from 'react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()

    const { error, data } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    // 👇 C'EST CA QUI MANQUE
    if (error) {
      console.error('❌ Login failed:', error.message)
      console.error('Error code:', error.status)
      console.error('Full error:', error)
      alert(`Login error: ${error.message}`)
    } else {
      console.log('✅ Login success!', data.user.email)
      // Redirect ou autre
    }
  }

  return (
    <form onSubmit={handleLogin}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
      />
      <button type="submit">Login</button>
    </form>
  )
}
