import { CONTRIBUTOR_CATEGORIES, type ContributorCategory } from '@shared/contribution'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { ChoiceGroup } from '@/components/ui/ChoiceGroup'
import { TextField } from '@/components/ui/Field'
import { Notice } from '@/components/ui/Notice'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { formatInLagos } from '@/lib/launch'
import { supabase } from '@/lib/supabase'
import { PageTitle } from './AdminLayout'

type Invitation = { id: string; status: 'active' | 'revoked'; expires_at: string; last_used_at: string | null; created_at: string }
type ContributorRow = {
  id: string
  full_name: string
  relationship: string | null
  category: ContributorCategory
  email: string | null
  created_at: string
  invitations: Invitation[]
  contributions: { id: string; status: string }[]
}

const CATEGORY_LABEL: Record<ContributorCategory, string> = { parent: 'Parent', sibling: 'Sibling', friend: 'Close friend' }

const isLive = (i: Invitation) => i.status === 'active' && new Date(i.expires_at).getTime() > Date.now()

export function AdminContributors() {
  const auth = useAuth()
  const [rows, setRows] = useState<ContributorRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<{ contributorId: string; name: string; link: string; expiresAt: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('contributors')
      .select(
        'id, full_name, relationship, category, email, created_at, invitations(id, status, expires_at, last_used_at, created_at), contributions(id, status)',
      )
      .order('created_at', { ascending: true })
    if (e) setError('Could not load contributors.')
    else setRows(data as ContributorRow[])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const issueLink = async (row: ContributorRow) => {
    const live = row.invitations.filter(isLive)
    if (live.length && !window.confirm(`Replace ${row.full_name}’s current link? The old link will stop working immediately. Their draft is kept.`))
      return
    setBusy(row.id)
    setError(null)
    const { data, error: e } = await supabase.rpc('admin_create_invitation', { p_contributor_id: row.id, p_expires_in_days: 60 })
    const created = (data as { invitation_id: string; token: string; expires_at: string }[] | null)?.[0]
    if (e || !created) {
      setBusy(null)
      setError('Could not create an invitation link.')
      return
    }
    if (live.length) {
      await supabase
        .from('invitations')
        .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_by: auth.user?.id ?? null })
        .in(
          'id',
          live.map((i) => i.id),
        )
    }
    setIssued({
      contributorId: row.id,
      name: row.full_name,
      link: `${window.location.origin}/contribute#t=${created.token}`,
      expiresAt: created.expires_at,
    })
    setBusy(null)
    void load()
  }

  const revoke = async (row: ContributorRow) => {
    if (!window.confirm(`Revoke ${row.full_name}’s invitation link? They will not be able to open the studio until you issue a new link.`)) return
    setBusy(row.id)
    const { error: e } = await supabase
      .from('invitations')
      .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_by: auth.user?.id ?? null })
      .eq('contributor_id', row.id)
      .eq('status', 'active')
    setBusy(null)
    if (e) setError('Could not revoke the link.')
    if (issued?.contributorId === row.id) setIssued(null)
    void load()
  }

  return (
    <>
      <PageTitle eyebrow="Invitations" title="Contributors">
        <Button onClick={() => setShowForm((v) => !v)} variant={showForm ? 'secondary' : 'primary'}>
          {showForm ? 'Close' : 'Add contributor'}
        </Button>
      </PageTitle>

      {showForm && (
        <NewContributorForm
          onCreated={() => {
            setShowForm(false)
            void load()
          }}
        />
      )}

      {issued && <IssuedLink {...issued} onDismiss={() => setIssued(null)} />}
      {error && <Notice tone="error" className="mb-6">{error}</Notice>}

      {!rows ? (
        <Spinner label="Loading…" />
      ) : rows.length === 0 ? (
        <p className="text-grey">No contributors yet. Add the first person you would like to invite.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-midnight-line">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="border-b border-midnight-line text-xs tracking-wide text-grey">
              <tr>
                <th scope="col" className="px-4 py-3 font-normal">Contributor</th>
                <th scope="col" className="px-4 py-3 font-normal">Link</th>
                <th scope="col" className="px-4 py-3 font-normal">Last opened</th>
                <th scope="col" className="px-4 py-3 font-normal">Contribution</th>
                <th scope="col" className="px-4 py-3 font-normal"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const live = row.invitations.filter(isLive)
                const latest = [...row.invitations].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
                const lastUsed = row.invitations.map((i) => i.last_used_at).filter(Boolean).sort().pop()
                const statuses = row.contributions.map((c) => c.status)
                return (
                  <tr key={row.id} className="border-b border-midnight-line last:border-0">
                    <td className="px-4 py-4">
                      <p className="text-ivory">{row.full_name}</p>
                      <p className="text-xs text-grey">
                        {CATEGORY_LABEL[row.category]}
                        {row.relationship ? ` · ${row.relationship}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      {live.length ? (
                        <span className="text-success">Active · expires {formatInLagos(live[0]!.expires_at, { dateStyle: 'medium' })}</span>
                      ) : latest ? (
                        <span className="text-grey">{latest.status === 'revoked' ? 'Revoked' : 'Expired'}</span>
                      ) : (
                        <span className="text-grey">Not invited yet</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-grey">{lastUsed ? formatInLagos(lastUsed, { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</td>
                    <td className="px-4 py-4">
                      {statuses.length ? (
                        <span className="flex flex-wrap gap-1">
                          {statuses.map((s, i) => (
                            <StatusBadge key={i} status={s} />
                          ))}
                        </span>
                      ) : (
                        <span className="text-grey">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" onClick={() => void issueLink(row)} loading={busy === row.id}>
                          {live.length ? 'Replace link' : 'Create link'}
                        </Button>
                        {live.length > 0 && (
                          <Button size="sm" variant="danger" onClick={() => void revoke(row)} disabled={busy === row.id}>
                            Revoke
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    draft: 'border-grey/40 text-grey',
    submitted: 'border-gold/50 text-gold-bright',
    in_review: 'border-gold/50 text-gold-bright',
    approved: 'border-success/50 text-success',
    rejected: 'border-danger/50 text-danger',
    changes_requested: 'border-gold/50 text-gold',
    hidden: 'border-grey/40 text-grey',
  }
  const label = status === 'draft' ? 'in progress' : status.replace('_', ' ')
  return <span className={cn('rounded-full border px-2 py-0.5 text-xs whitespace-nowrap', tone[status])}>{label}</span>
}

function IssuedLink({ name, link, expiresAt, onDismiss }: { name: string; link: string; expiresAt: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState<'link' | 'message' | null>(null)
  const firstName = name.split(' ')[0] ?? name
  const message = `Hi ${firstName}, we’re putting together something special for Roni’s 30th birthday on 3 December, and we’d love your memories in it. Here is your private link (please don’t share it): ${link}\nYour answers save as you go, so you can come back to it. The link works until ${formatInLagos(expiresAt, { dateStyle: 'long' })}. Please keep it a surprise!`
  const copy = async (what: 'link' | 'message') => {
    try {
      await navigator.clipboard.writeText(what === 'link' ? link : message)
      setCopied(what)
    } catch {
      setCopied(null)
    }
  }
  return (
    <div role="status" className="mb-8 rounded-2xl border border-gold/40 bg-gold/[0.06] p-5">
      <p className="text-ivory">Invitation link for {name}</p>
      <p className="mt-1 text-sm text-grey">
        Copy it now and send it privately. Only a fingerprint of the link is stored, so it cannot be shown again. Expires{' '}
        {formatInLagos(expiresAt, { dateStyle: 'long' })}.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input readOnly value={link} aria-label="Invitation link" className="field-input font-mono text-xs" onFocus={(e) => e.target.select()} />
        <div className="flex gap-2">
          <Button onClick={() => void copy('link')}>{copied === 'link' ? 'Copied' : 'Copy link'}</Button>
          <Button variant="ghost" onClick={onDismiss}>
            Done
          </Button>
        </div>
      </div>
      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-grey hover:text-ivory">Invitation or reminder message</summary>
        <p className="mt-3 rounded-xl border border-midnight-line bg-midnight p-4 text-sm leading-relaxed whitespace-pre-line text-ivory/85">{message}</p>
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => void copy('message')}>
          {copied === 'message' ? 'Copied' : 'Copy message'}
        </Button>
        <p className="mt-2 text-xs text-grey">
          Send it yourself by WhatsApp, text or email. Automatic delivery needs an email or SMS provider to be configured, which this
          site does not have yet. To remind someone, use “Replace link”: their draft is kept.
        </p>
      </details>
    </div>
  )
}

function NewContributorForm({ onCreated }: { onCreated: () => void }) {
  const auth = useAuth()
  const [fullName, setFullName] = useState('')
  const [relationship, setRelationship] = useState('')
  const [category, setCategory] = useState<ContributorCategory | null>(null)
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!fullName.trim() || !category) {
      setError('A name and a category are required.')
      return
    }
    setPending(true)
    setError(null)
    const { error: e } = await supabase.from('contributors').insert({
      full_name: fullName.trim(),
      relationship: relationship.trim() || null,
      category,
      email: email.trim() || null,
      created_by: auth.user?.id ?? null,
    })
    setPending(false)
    if (e) setError('Could not add this contributor.')
    else onCreated()
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mb-10 grid gap-6 rounded-2xl border border-midnight-line p-6 md:grid-cols-2" noValidate>
      <TextField label="Full name" value={fullName} onValueChange={setFullName} maxLength={120} required />
      <TextField label="Relationship to Roni" hint="Pre-fills their form; they can change it." optional value={relationship} onValueChange={setRelationship} maxLength={120} />
      <TextField label="Email" hint="For your reference only. Nothing is emailed automatically." optional type="email" value={email} onValueChange={setEmail} maxLength={254} />
      <ChoiceGroup<ContributorCategory>
        legend="Category"
        hint="Decides which extra questions they see."
        name="category"
        value={category}
        onChange={setCategory}
        choices={CONTRIBUTOR_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))}
      />
      <div className="flex flex-col gap-3 md:col-span-2">
        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" loading={pending} className="self-start">
          Add contributor
        </Button>
      </div>
    </form>
  )
}
