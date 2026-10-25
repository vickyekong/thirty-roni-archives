import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Notice } from '@/components/ui/Notice'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth, type AppRole } from '@/lib/auth'
import { formatInLagos } from '@/lib/launch'
import { ADMIN_ACCOUNTS_ENDPOINT, supabase } from '@/lib/supabase'
import { env } from '@/lib/env'
import { PageTitle } from './AdminLayout'
import { Check, Input, Panel, Pill } from './kit'

type Account = {
  id: string
  email: string | null
  displayName: string | null
  roles: AppRole[]
  createdAt: string
  lastSignInAt: string | null
}

const ROLE_LABEL: Record<AppRole, string> = { admin: 'Curator', roni: 'Roni', family_viewer: 'Family viewer' }
const ROLE_HINT: Record<AppRole, string> = {
  admin: 'Full access to this dashboard and the preview.',
  roni: 'Opens the birthday experience after launch and owns The Continuing Story.',
  family_viewer: 'Can view the experience after launch, only while family access is switched on. Never sees “Roni only” content.',
}

async function callAccounts<T>(body: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const res = await fetch(ADMIN_ACCOUNTS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as { message?: string } & T
  if (!res.ok) throw new Error(json.message ?? 'Something went wrong.')
  return json
}

export function AdminAccounts() {
  const auth = useAuth()
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    try {
      const { accounts: list } = await callAccounts<{ accounts: Account[] }>({ action: 'list' })
      setAccounts(list)
    } catch (e) {
      setError((e as Error).message)
      setAccounts([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (id: string, body: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return null
    setBusy(id)
    setError(null)
    try {
      return await callAccounts<Record<string, unknown>>(body)
    } catch (e) {
      setError((e as Error).message)
      return null
    } finally {
      setBusy(null)
    }
  }

  const toggleRole = async (a: Account, role: AppRole) => {
    const roles = a.roles.includes(role) ? a.roles.filter((r) => r !== role) : [...a.roles, role]
    if (await run(a.id, { action: 'set_roles', userId: a.id, roles })) void load()
  }

  return (
    <>
      <PageTitle eyebrow="Who can sign in" title="Accounts">
        <Button onClick={() => setShowForm((v) => !v)} variant={showForm ? 'secondary' : 'primary'}>
          {showForm ? 'Close' : 'Create account'}
        </Button>
      </PageTitle>
      <Notice className="mb-8">
        Contributors never need an account; they use their private invitation link. Accounts are for you, Roni, and any family members you
        allow to view the experience. Passwords are generated securely and shown once; share them privately. No emails are sent.
      </Notice>
      {showForm && (
        <NewAccountForm
          onCreated={(email, password) => {
            setShowForm(false)
            setSecret({ email, password })
            void load()
          }}
        />
      )}
      {secret && <PasswordReveal {...secret} onDismiss={() => setSecret(null)} />}
      {error && <Notice tone="error" className="mb-6">{error}</Notice>}

      {!accounts ? (
        <Spinner label="Loading…" />
      ) : (
        <ul className="flex flex-col gap-3">
          {accounts.map((a) => (
            <li key={a.id} className="rounded-xl border border-midnight-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-ivory">
                    {a.displayName ?? a.email}
                    {a.id === auth.user?.id && <span className="ml-2 text-xs text-grey">(you)</span>}
                  </p>
                  <p className="text-sm text-grey">{a.email}</p>
                  <p className="mt-1 text-xs text-grey">
                    Last sign-in: {a.lastSignInAt ? formatInLagos(a.lastSignInAt, { dateStyle: 'medium', timeStyle: 'short' }) : 'never'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {a.roles.length === 0 && <Pill tone="danger">No access</Pill>}
                  {a.roles.map((r) => (
                    <Pill key={r} tone="gold">{ROLE_LABEL[r]}</Pill>
                  ))}
                </div>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-grey hover:text-ivory">Manage</summary>
                <div className="mt-4 flex flex-col gap-3">
                  {(Object.keys(ROLE_LABEL) as AppRole[]).map((role) => (
                    <Check
                      key={role}
                      label={ROLE_LABEL[role]}
                      hint={ROLE_HINT[role]}
                      checked={a.roles.includes(role)}
                      disabled={busy === a.id || (role === 'admin' && a.id === auth.user?.id)}
                      onChecked={() => void toggleRole(a, role)}
                    />
                  ))}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy === a.id}
                      onClick={async () => {
                        const r = await run(a.id, { action: 'reset_password', userId: a.id }, `Generate a new password for ${a.email}? The old one stops working.`)
                        if (r?.password) setSecret({ email: a.email ?? '', password: r.password as string })
                      }}
                    >
                      Reset password
                    </Button>
                    {a.id !== auth.user?.id && (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busy === a.id}
                        onClick={async () => {
                          if (await run(a.id, { action: 'delete', userId: a.id }, `Delete the account for ${a.email}? This cannot be undone.`)) void load()
                        }}
                      >
                        Delete account
                      </Button>
                    )}
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function NewAccountForm({ onCreated }: { onCreated: (email: string, password: string) => void }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [roles, setRoles] = useState<AppRole[]>(['family_viewer'])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !name.trim() || roles.length === 0) return setError('Add an email, a name and at least one role.')
    setBusy(true)
    setError(null)
    try {
      const r = await callAccounts<{ email: string; password: string }>({ action: 'create', email, displayName: name, roles })
      onCreated(r.email, r.password)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel className="mb-8">
      <form onSubmit={(e) => void submit(e)} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Input label="Name" value={name} onValue={setName} maxLength={120} autoComplete="off" />
        <Input label="Email" type="email" value={email} onValue={setEmail} maxLength={254} autoComplete="off" />
        <fieldset className="flex flex-col gap-3 sm:col-span-2">
          <legend className="mb-2 text-sm text-ivory">Access</legend>
          {(Object.keys(ROLE_LABEL) as AppRole[]).map((role) => (
            <Check
              key={role}
              label={ROLE_LABEL[role]}
              hint={ROLE_HINT[role]}
              checked={roles.includes(role)}
              onChecked={(v) => setRoles((r) => (v ? [...r, role] : r.filter((x) => x !== role)))}
            />
          ))}
        </fieldset>
        {error && <Notice tone="error" className="sm:col-span-2">{error}</Notice>}
        <Button type="submit" loading={busy} className="self-start">
          Create account
        </Button>
      </form>
    </Panel>
  )
}

function PasswordReveal({ email, password, onDismiss }: { email: string; password: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false)
  const signIn = `${window.location.origin}/sign-in`
  const text = `Sign in at ${signIn}\nEmail: ${email}\nPassword: ${password}`
  return (
    <div role="status" className="mb-8 rounded-2xl border border-gold/40 bg-gold/[0.06] p-5">
      <p className="text-ivory">Password for {email}</p>
      <p className="mt-1 text-sm text-grey">Shown once. Copy it now and share it privately (in person or a private message).</p>
      <pre className="mt-4 overflow-x-auto rounded-xl border border-midnight-line bg-midnight p-4 font-mono text-sm whitespace-pre-wrap">{text}</pre>
      <div className="mt-4 flex gap-2">
        <Button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text)
              setCopied(true)
            } catch {
              setCopied(false)
            }
          }}
        >
          {copied ? 'Copied' : 'Copy details'}
        </Button>
        <Button variant="ghost" onClick={onDismiss}>
          Done
        </Button>
      </div>
    </div>
  )
}
