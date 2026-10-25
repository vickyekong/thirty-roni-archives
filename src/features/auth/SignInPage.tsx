import { useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { Notice } from '@/components/ui/Notice'
import { Wordmark } from '@/components/ui/Wordmark'
import { useAuth } from '@/lib/auth'

function safeNext(value: string | null, fallback: string) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : fallback
}

export function SignInPage({ defaultNext = '/my-archive' }: { defaultNext?: string }) {
  const auth = useAuth()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const next = safeNext(params.get('next'), defaultNext)

  if (auth.status === 'signed-in') return <Navigate to={next} replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setPending(true)
    setError(await auth.signIn(email.trim(), password))
    setPending(false)
  }

  return (
    <div className="grain flex min-h-dvh flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <Wordmark />
        <h1 className="display mt-10 text-4xl">Sign in</h1>
        <p className="mt-3 text-sm leading-relaxed text-grey">Accounts are created by the curator. There is no public sign-up.</p>
        <form onSubmit={(e) => void submit(e)} className="mt-8 flex flex-col gap-4" noValidate>
          <TextField label="Email" type="email" autoComplete="email" required value={email} onValueChange={setEmail} />
          <TextField label="Password" type="password" autoComplete="current-password" required value={password} onValueChange={setPassword} />
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" size="lg" loading={pending} disabled={!email || !password}>
            Sign in
          </Button>
        </form>
      </div>
    </div>
  )
}
