import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Button, buttonClasses } from '@/components/ui/Button'
import { Notice } from '@/components/ui/Notice'
import { Spinner } from '@/components/ui/Spinner'
import { formatInLagos, lagosInputToIso, isoToLagosInput, useCountdown, useSiteSettings, type SiteSettings } from '@/lib/launch'
import { supabase } from '@/lib/supabase'
import { PageTitle } from './AdminLayout'
import { useOriginalCollection } from './kit'

type Stats = {
  contributors: number
  active_invitations: number
  drafts: number
  submitted: number
  approved: number
  rejected: number
  changes_requested: number
  hidden: number
  media: number
  milestones: number
  published_items: number
  featured_wishes: number
  open_removal_requests: number
  original_locked: boolean
}

const CARDS: { key: Exclude<keyof Stats, 'original_locked'>; label: string; to?: string }[] = [
  { key: 'contributors', label: 'Invited contributors', to: '/admin/contributors' },
  { key: 'active_invitations', label: 'Active invitation links', to: '/admin/contributors' },
  { key: 'drafts', label: 'Being written' },
  { key: 'submitted', label: 'Awaiting review', to: '/admin/submissions' },
  { key: 'approved', label: 'Approved', to: '/admin/submissions' },
  { key: 'changes_requested', label: 'Changes requested', to: '/admin/submissions' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'hidden', label: 'Hidden' },
  { key: 'media', label: 'Media files', to: '/admin/library' },
  { key: 'milestones', label: 'Timeline milestones', to: '/admin/timeline' },
  { key: 'published_items', label: 'Published memories, wishes & letters' },
  { key: 'open_removal_requests', label: 'Open removal requests', to: '/admin/submissions' },
]

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

type Readiness = { label: string; count: number; to: string; hint: string }

const SETTINGS_SELECT = 'launch_at, timezone, experience_active, contributions_open, family_access_enabled, preview_enabled'

export function AdminOverview() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [readiness, setReadiness] = useState<Readiness[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { settings, setSettings, error: settingsError } = useSiteSettings()
  const { collection, reload: reloadCollection } = useOriginalCollection()
  const countdown = useCountdown(settings?.launch_at ?? null)
  const [saving, setSaving] = useState<string | null>(null)
  const [launchInput, setLaunchInput] = useState('')

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('admin_dashboard_stats')
    if (e) setError('Could not load statistics.')
    else setStats(data as Stats)
    const published = (table: string) => supabase.from(table).select('*', { count: 'exact', head: true }).eq('is_published', true)
    const results = await Promise.all([
      published('chapters'),
      published('timeline_milestones'),
      published('memories'),
      published('contributor_profiles'),
      published('birthday_wishes').not('star_index', 'is', null),
      published('letters'),
      published('experience_content').eq('key', 'roni_times'),
    ])
    const [chapters = 0, milestones = 0, memories = 0, people = 0, wishes = 0, letters = 0, times = 0] = results.map((r) => r.count ?? 0)
    setReadiness([
      { label: 'Chapter introductions', count: chapters, to: '/admin/timeline', hint: 'of 4 published' },
      { label: 'Timeline milestones', count: milestones, to: '/admin/timeline', hint: 'published' },
      { label: 'Memory Vault', count: memories, to: '/admin/stories', hint: 'memories published' },
      { label: 'Through Their Eyes', count: people, to: '/admin/people', hint: 'people published' },
      { label: 'Thirty Wishes', count: wishes, to: '/admin/wishes', hint: 'of 30 stars lit' },
      { label: 'Words Worth Keeping', count: letters, to: '/admin/stories?tab=letters', hint: 'letters published' },
      { label: 'The Roni Times', count: times, to: '/admin/editorial?tab=roni_times', hint: times ? 'published' : 'not published' },
    ])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (settings) setLaunchInput(isoToLagosInput(settings.launch_at))
  }, [settings])

  const updateSettings = async (patch: Partial<SiteSettings>, key: string) => {
    setSaving(key)
    setError(null)
    const { data, error: e } = await supabase
      .from('site_settings')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', 1)
      .select(SETTINGS_SELECT)
      .single()
    setSaving(null)
    if (e || !data) setError('Could not update the setting.')
    else setSettings(data as SiteSettings)
  }

  const toggle = (key: 'contributions_open' | 'experience_active' | 'family_access_enabled' | 'preview_enabled', label: string) => {
    if (!settings) return
    const next = !settings[key]
    if (!window.confirm(`${label}: turn ${next ? 'on' : 'off'}?`)) return
    void updateSettings({ [key]: next }, key)
  }

  const saveLaunch = () => {
    const iso = lagosInputToIso(launchInput)
    if (!iso) return setError('Choose a valid date and time.')
    if (!window.confirm(`Open the archive at ${formatInLagos(iso, { dateStyle: 'full', timeStyle: 'short' })} (Lagos time)?`)) return
    void updateSettings({ launch_at: iso }, 'launch_at')
  }

  const setLock = async (locked: boolean) => {
    const text = locked
      ? 'Lock the Original Thirty? Every curated item, chapter and editorial page becomes read-only, preserving the birthday collection exactly as it is.'
      : 'Unlock the Original Thirty? Edits become possible again. Only do this to correct a genuine mistake.'
    if (!window.confirm(text)) return
    setSaving('lock')
    const { error: e } = await supabase.rpc('admin_set_original_lock', { p_locked: locked })
    setSaving(null)
    if (e) setError('Could not change the lock.')
    void reloadCollection()
    void load()
  }

  return (
    <>
      <PageTitle eyebrow="Curator dashboard" title="Overview">
        <a href="/" target="_blank" rel="noreferrer" className={buttonClasses('secondary')}>
          Preview the experience
        </a>
      </PageTitle>
      {error && <Notice tone="error" className="mb-6">{error}</Notice>}

      {!stats ? (
        <Spinner label="Loading…" />
      ) : (
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-midnight-line bg-midnight-line sm:grid-cols-3 lg:grid-cols-4">
          {CARDS.map((card) => (
            <div key={card.key} className="flex flex-col-reverse gap-1 bg-midnight p-5">
              <dt className="text-xs tracking-wide text-grey">
                {card.to ? (
                  <Link to={card.to} className="hover:text-ivory">
                    {card.label}
                  </Link>
                ) : (
                  card.label
                )}
              </dt>
              <dd className="font-serif text-4xl text-ivory tabular-nums">{stats[card.key]}</dd>
            </div>
          ))}
        </dl>
      )}

      <section className="mt-14" aria-labelledby="launch-heading">
        <h2 id="launch-heading" className="font-serif text-3xl">
          Birthday launch
        </h2>
        {settingsError && <Notice tone="error" className="mt-4">{settingsError}</Notice>}
        {settings && (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-4 rounded-2xl border border-midnight-line p-6">
              <div>
                <p className="text-sm text-grey">Opens</p>
                <p className="mt-1 font-serif text-2xl">{formatInLagos(settings.launch_at, { dateStyle: 'full', timeStyle: 'short' })}</p>
                <p className="text-sm text-grey">{settings.timezone} (WAT, UTC+1, no daylight saving)</p>
                {countdown && !countdown.done && (
                  <p className="mt-3 text-sm text-ivory/80 tabular-nums">
                    {plural(countdown.days, 'day')}, {plural(countdown.hours, 'hour')}, {plural(countdown.minutes, 'minute')} to go
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span>Change launch time (Lagos)</span>
                  <input type="datetime-local" className="field-input py-2" value={launchInput} onChange={(e) => setLaunchInput(e.target.value)} />
                </label>
                <Button size="sm" variant="secondary" onClick={saveLaunch} loading={saving === 'launch_at'} disabled={launchInput === isoToLagosInput(settings.launch_at)}>
                  Save time
                </Button>
              </div>
              <p className="text-sm leading-relaxed text-grey">
                Roni and family see published content only when the experience is switched on <em>and</em> this time has passed. Both
                conditions are enforced by the database, not just this page.
              </p>
            </div>
            <div className="flex flex-col gap-4 rounded-2xl border border-midnight-line p-6">
              <SettingRow label="Contributions open" description="Invited contributors can start new contributions." value={settings.contributions_open} busy={saving === 'contributions_open'} onToggle={() => toggle('contributions_open', 'Contributions open')} />
              <SettingRow label="Birthday experience switched on" description="Required, together with the launch time, before Roni can open the archive." value={settings.experience_active} busy={saving === 'experience_active'} onToggle={() => toggle('experience_active', 'Birthday experience')} />
              <SettingRow label="Family access" description="Family viewer accounts can open the experience after launch. They never see “Roni only” content." value={settings.family_access_enabled} busy={saving === 'family_access_enabled'} onToggle={() => toggle('family_access_enabled', 'Family access')} />
              <SettingRow label="Curator preview" description="When on, curators see the full experience at the home page before launch. Turn off to see the countdown Roni sees." value={settings.preview_enabled} busy={saving === 'preview_enabled'} onToggle={() => toggle('preview_enabled', 'Curator preview')} />
            </div>
          </div>
        )}
      </section>

      <section className="mt-14" aria-labelledby="ready-heading">
        <h2 id="ready-heading" className="font-serif text-3xl">
          What Roni will see
        </h2>
        <p className="mt-2 text-sm text-grey">Only published items appear. Sections with nothing published are left out of the experience.</p>
        {!readiness ? (
          <Spinner />
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {readiness.map((r) => (
              <li key={r.label}>
                <Link to={r.to} className="flex items-center justify-between gap-3 rounded-xl border border-midnight-line p-4 transition-colors hover:border-gold/40">
                  <span>
                    <span className="block text-ivory">{r.label}</span>
                    <span className="text-xs text-grey">{r.hint}</span>
                  </span>
                  <span className={r.count ? 'font-serif text-3xl text-gold-bright tabular-nums' : 'font-serif text-3xl text-grey/60 tabular-nums'}>{r.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-14" aria-labelledby="lock-heading">
        <h2 id="lock-heading" className="font-serif text-3xl">
          Preserve the Original Thirty
        </h2>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-midnight-line p-6">
          <p className="max-w-2xl text-sm leading-relaxed text-grey">
            {collection?.is_locked
              ? `Locked${collection.snapshot_at ? ` on ${formatInLagos(collection.snapshot_at, { dateStyle: 'long', timeStyle: 'short' })}` : ''}. The birthday collection is read-only for everyone, including you. Roni’s Continuing Story is unaffected.`
              : 'Once the birthday has happened, lock the collection so it stays exactly as Roni first saw it. Roni can never edit it; her own additions go into The Continuing Story.'}
          </p>
          <Button variant={collection?.is_locked ? 'secondary' : 'primary'} onClick={() => void setLock(!collection?.is_locked)} loading={saving === 'lock'} disabled={!collection}>
            {collection?.is_locked ? 'Unlock' : 'Lock collection'}
          </Button>
        </div>
      </section>
    </>
  )
}

function SettingRow({
  label,
  description,
  value,
  busy,
  onToggle,
}: {
  label: string
  description: string
  value: boolean
  busy?: boolean
  onToggle?: () => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-midnight-line pb-4 last:border-0 last:pb-0">
      <div>
        <p className="text-ivory">{label}</p>
        <p className="text-sm text-grey">{description}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className={value ? 'text-sm text-success' : 'text-sm text-grey'}>{value ? 'On' : 'Off'}</span>
        {onToggle && (
          <Button size="sm" variant="secondary" className="whitespace-nowrap" onClick={onToggle} loading={busy}>
            {value ? 'Turn off' : 'Turn on'}
          </Button>
        )}
      </div>
    </div>
  )
}
