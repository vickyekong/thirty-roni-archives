import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Notice } from '@/components/ui/Notice'
import { Spinner } from '@/components/ui/Spinner'
import { useSignedUrls } from '@/lib/media'
import { supabase } from '@/lib/supabase'
import { PageTitle } from './AdminLayout'
import { MediaPicker, MediaThumb, loadMediaByIds, type PickerMedia } from './MediaPicker'
import { Area, Check, Input, LockedNotice, Panel, Pill, PublishedPill, Select, publishMedia, useEditParam, useOriginalCollection } from './kit'

type Profile = {
  id: string
  contributor_id: string
  display_name: string
  relationship_label: string | null
  portrait_media_id: string | null
  voice_media_id: string | null
  video_media_id: string | null
  message: string | null
  tone: 'heartfelt' | 'humorous' | 'both' | null
  sort_order: number
  is_published: boolean
  is_sample: boolean
}

type Contributor = { id: string; full_name: string; relationship: string | null }

const SELECT = 'id, contributor_id, display_name, relationship_label, portrait_media_id, voice_media_id, video_media_id, message, tone, sort_order, is_published, is_sample'

export function AdminPeople() {
  const { collection } = useOriginalCollection()
  const [rows, setRows] = useState<Profile[] | null>(null)
  const [contributors, setContributors] = useState<Contributor[]>([])
  const [media, setMedia] = useState<Record<string, PickerMedia>>({})
  const [editing, setEditing] = useEditParam(rows !== null)
  const locked = Boolean(collection?.is_locked)

  const load = useCallback(async () => {
    const [p, c] = await Promise.all([
      supabase.from('contributor_profiles').select(SELECT).order('sort_order').order('created_at'),
      supabase.from('contributors').select('id, full_name, relationship').order('full_name'),
    ])
    const list = (p.data ?? []) as Profile[]
    const loaded = await loadMediaByIds(
      list.flatMap((r) => [r.portrait_media_id, r.voice_media_id, r.video_media_id]).filter((x): x is string => Boolean(x)),
    )
    setMedia(Object.fromEntries(loaded.map((x) => [x.id, x])))
    setRows(list)
    setContributors((c.data ?? []) as Contributor[])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const portraits = (rows ?? []).map((r) => (r.portrait_media_id ? media[r.portrait_media_id] : undefined)).filter((x): x is PickerMedia => Boolean(x))
  const urls = useSignedUrls(portraits)

  const move = async (index: number, delta: number) => {
    if (!rows) return
    const target = index + delta
    if (target < 0 || target >= rows.length) return
    const next = [...rows]
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    setRows(next)
    await Promise.all(next.map((r, i) => supabase.from('contributor_profiles').update({ sort_order: i }).eq('id', r.id)))
  }

  const withoutProfile = contributors.filter((c) => !rows?.some((r) => r.contributor_id === c.id))
  const done = () => {
    setEditing(null)
    void load()
  }

  return (
    <>
      <PageTitle eyebrow="Through their eyes" title="People">
        <Button onClick={() => setEditing('new')} disabled={locked || withoutProfile.length === 0}>
          Add person
        </Button>
      </PageTitle>
      <LockedNotice collection={collection} />
      <Notice className="mb-8">
        Each card appears in <em>Through Their Eyes</em>. Cards are created when you add an approved submission to the archive, unless
        the contributor chose to stay anonymous. Respect their choices when editing names.
        {rows && withoutProfile.length === 0 && ' Every contributor already has a card, so there is no one to add.'}
      </Notice>
      {editing === 'new' && <ProfileEditor profile={null} contributors={withoutProfile} media={media} onDone={done} />}
      {!rows ? (
        <Spinner label="Loading…" />
      ) : rows.length === 0 ? (
        <p className="text-grey">No people yet.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map((r, i) =>
            editing === r.id ? (
              <li key={r.id} id={`edit-${r.id}`} className="scroll-mt-24">
                <ProfileEditor profile={r} contributors={contributors} media={media} onDone={done} />
              </li>
            ) : (
              <li key={r.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-midnight-line p-3">
                <div className="w-14 shrink-0">
                  {r.portrait_media_id && media[r.portrait_media_id] ? (
                    <MediaThumb media={media[r.portrait_media_id]!} url={urls[r.portrait_media_id]} />
                  ) : (
                    <div className="aspect-square rounded-lg border border-dashed border-midnight-line" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-ivory">{r.display_name}</p>
                  <p className="text-xs text-grey">{r.relationship_label ?? '—'}</p>
                </div>
                <div className="flex items-center gap-2">
                  {r.is_sample && <Pill tone="gold">Sample</Pill>}
                  {r.voice_media_id && <Pill>Voice</Pill>}
                  {r.video_media_id && <Pill>Video</Pill>}
                  <PublishedPill published={r.is_published} />
                  <Button size="sm" variant="ghost" aria-label="Move up" onClick={() => void move(i, -1)} disabled={locked || i === 0}>
                    ↑
                  </Button>
                  <Button size="sm" variant="ghost" aria-label="Move down" onClick={() => void move(i, 1)} disabled={locked || i === rows.length - 1}>
                    ↓
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditing(r.id)} disabled={locked}>
                    Edit
                  </Button>
                </div>
              </li>
            ),
          )}
        </ol>
      )}
    </>
  )
}

function ProfileEditor({
  profile,
  contributors,
  media,
  onDone,
}: {
  profile: Profile | null
  contributors: Contributor[]
  media: Record<string, PickerMedia>
  onDone: () => void
}) {
  const [d, setD] = useState({
    contributorId: profile?.contributor_id ?? contributors[0]?.id ?? '',
    name: profile?.display_name ?? contributors[0]?.full_name ?? '',
    relationship: profile?.relationship_label ?? contributors[0]?.relationship ?? '',
    message: profile?.message ?? '',
    tone: profile?.tone ?? '',
    portrait: profile?.portrait_media_id ?? null,
    voice: profile?.voice_media_id ?? null,
    video: profile?.video_media_id ?? null,
    published: profile?.is_published ?? false,
  })
  const [known, setKnown] = useState(media)
  const [picker, setPicker] = useState<'portrait' | 'voice' | 'video' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<typeof d>) => setD((p) => ({ ...p, ...patch }))
  const portrait = d.portrait ? known[d.portrait] : undefined
  const urls = useSignedUrls(portrait ? [portrait] : null)

  const save = async () => {
    if (!d.contributorId) return setError('Choose a contributor.')
    if (!d.name.trim()) return setError('Add a display name.')
    if (d.published) {
      if (portrait && !portrait.alt_text) return setError('Add alt text for the portrait in the Library before publishing.')
      for (const id of [d.voice, d.video]) {
        const m = id ? known[id] : undefined
        if (m && !m.transcript && !m.caption) return setError('Add a transcript for voice and video in the Library before publishing.')
      }
    }
    setBusy(true)
    setError(null)
    const row = {
      display_name: d.name.trim(),
      relationship_label: d.relationship.trim() || null,
      message: d.message.trim() || null,
      tone: d.tone || null,
      portrait_media_id: d.portrait,
      voice_media_id: d.voice,
      video_media_id: d.video,
      is_published: d.published,
    }
    const { error: e } = profile
      ? await supabase.from('contributor_profiles').update(row).eq('id', profile.id)
      : await supabase.from('contributor_profiles').insert({ ...row, contributor_id: d.contributorId, sort_order: 999 })
    if (e) {
      setBusy(false)
      return setError('Could not save.')
    }
    if (d.published) await publishMedia([d.portrait, d.voice, d.video])
    setBusy(false)
    onDone()
  }

  const remove = async () => {
    if (!profile || !window.confirm(`Remove ${profile.display_name}’s card? Their submission is kept.`)) return
    setBusy(true)
    await supabase.from('contributor_profiles').delete().eq('id', profile.id)
    onDone()
  }

  const mediaRow = (key: 'voice' | 'video', label: string) => {
    const m = d[key] ? known[d[key]!] : undefined
    return (
      <div>
        <p className="mb-1 text-sm text-ivory">{label}</p>
        <p className="text-sm text-grey">{m ? `${m.caption || m.original_filename || label}${m.transcript ? '' : ' · no transcript yet'}` : 'None'}</p>
        <div className="mt-2 flex gap-1">
          <Button size="sm" variant="secondary" onClick={() => setPicker(key)}>Choose</Button>
          {m && <Button size="sm" variant="ghost" onClick={() => set({ [key]: null })}>Clear</Button>}
        </div>
      </div>
    )
  }

  return (
    <Panel className="mb-4 border-gold/30">
      <div className="grid gap-4 sm:grid-cols-2">
        {!profile && (
          <Select
            className="sm:col-span-2"
            label="Contributor"
            value={d.contributorId}
            onValue={(id) => {
              const c = contributors.find((x) => x.id === id)
              set({ contributorId: id, name: c?.full_name ?? '', relationship: c?.relationship ?? '' })
            }}
            options={contributors.map((c) => ({ value: c.id, label: c.full_name }))}
          />
        )}
        <Input label="Name shown" value={d.name} onValue={(v) => set({ name: v })} maxLength={120} />
        <Input label="Relationship" value={d.relationship} onValue={(v) => set({ relationship: v })} maxLength={120} />
        <Area className="sm:col-span-2" label="Message" value={d.message} onValue={(v) => set({ message: v })} maxLength={8000} rows={4} />
        <Select
          label="Tone"
          value={d.tone}
          onValue={(v) => set({ tone: v })}
          options={[{ value: '', label: 'Not set' }, { value: 'heartfelt', label: 'Heartfelt' }, { value: 'humorous', label: 'Humorous' }, { value: 'both', label: 'A bit of both' }]}
        />
        <div>
          <p className="mb-1 text-sm text-ivory">Portrait</p>
          {portrait ? <MediaThumb media={portrait} url={urls[portrait.id]} className="w-24" /> : <p className="text-sm text-grey">None</p>}
          <div className="mt-2 flex gap-1">
            <Button size="sm" variant="secondary" onClick={() => setPicker('portrait')}>Choose</Button>
            {portrait && <Button size="sm" variant="ghost" onClick={() => set({ portrait: null })}>Clear</Button>}
          </div>
        </div>
        {mediaRow('voice', 'Voice message')}
        {mediaRow('video', 'Video message')}
        <Check label="Published" hint="Media attached here is published with the card." checked={d.published} onChecked={(v) => set({ published: v })} />
      </div>
      {error && <Notice tone="error" className="mt-4">{error}</Notice>}
      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={() => void save()} loading={busy}>Save</Button>
        <Button variant="ghost" onClick={onDone} disabled={busy}>Cancel</Button>
        {profile && <Button variant="danger" className="ml-auto" onClick={() => void remove()} disabled={busy}>Remove card</Button>}
      </div>
      <MediaPicker
        open={picker !== null}
        kinds={picker === 'portrait' ? ['image'] : picker === 'voice' ? ['audio'] : ['video']}
        title={picker === 'portrait' ? 'Choose a portrait' : picker === 'voice' ? 'Choose a voice message' : 'Choose a video'}
        onClose={() => setPicker(null)}
        onPick={(m) => {
          setKnown((k) => ({ ...k, [m.id]: m }))
          if (picker) set({ [picker]: m.id })
        }}
      />
    </Panel>
  )
}
