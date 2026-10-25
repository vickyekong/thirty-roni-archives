// Fills every section of the experience with clearly labelled SAMPLE content, so curators can
// see the whole site before real contributions arrive. Nothing here is about the real Roni:
// every name, text and photo says it is a sample.
//
// Sample contributors go through the real contributor flow (the `contribute` edge function),
// then are approved, added to the archive and published exactly as a curator would. Timeline
// milestones and editorial pages are created as curator content.
//
// Usage (needs a curator account):
//   SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/seed-samples.mjs
// Remove everything again from the dashboard Overview: "Remove all sample content".
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, ADMIN_EMAIL and ADMIN_PASSWORD')
  process.exit(1)
}

const PHOTOS = fileURLToPath(new URL('./sample-photos/', import.meta.url))
const ENDPOINT = `${SUPABASE_URL}/functions/v1/contribute`
const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })

const must = (label, { data, error }) => {
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}

async function contribute(body) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!json.ok) throw new Error(`${body.action}: ${JSON.stringify(json.error)}`)
  return json.data
}

const photo = (file) => readFile(PHOTOS + file)

// Same titles the dashboard's "Add to the archive" uses, so the result matches a real import.
const TITLES = {
  earliest: 'A first memory',
  favourite: 'A favourite memory',
  unknownFact: 'Something people might not know',
  funniest: 'The funniest moment',
  childhoodPersonality: 'As a child',
  lessons: 'What raising her taught me',
  adventures: 'Childhood adventures',
  funnyMemories: 'Funny memories',
  howWeMet: 'How we met',
  sharedExperiences: 'Shared experiences',
  friendshipMoments: 'Moments that shaped our friendship',
}

// Same question → category mapping as the dashboard import.
const CATEGORIES = {
  earliest: 'childhood',
  childhoodPersonality: 'childhood',
  adventures: 'childhood',
  funniest: 'funny',
  funnyMemories: 'funny',
  howWeMet: 'friendship',
  sharedExperiences: 'friendship',
  friendshipMoments: 'friendship',
  unknownFact: 'reflection',
  lessons: 'reflection',
}
const categoryFor = (key, contributor) => CATEGORIES[key] ?? (contributor === 'friend' ? 'friendship' : 'family')

const answer = (who, question, extra = '') =>
  `Sample text from ${who}, answering “${question}”. A real contributor’s answer appears here in their own words, exactly as they write it.${extra ? `\n\n${extra}` : ''}`

const PEOPLE = [
  {
    name: 'Sample Parent',
    relationship: 'Mum (sample)',
    category: 'parent',
    timeline: { precision: 'specific_year', year: 1999, lifeStage: null },
    nameVisibility: 'full_name',
    memories: {
      earliest: 'Your earliest memory of Roni',
      favourite: 'A favourite memory with Roni',
    },
    answers: {
      childhoodPersonality: 'What was Roni like as a child?',
      lessons: 'What did raising her teach you?',
    },
    letter: true,
    photos: ['sample-01.jpg', 'sample-02.jpg'],
    portrait: 'sample-09.jpg',
    featured: true,
  },
  {
    name: 'Sample Sibling',
    relationship: 'Brother (sample)',
    category: 'sibling',
    timeline: { precision: 'approximate_year', year: 2007, lifeStage: null },
    nameVisibility: 'first_name',
    memories: { funniest: 'The funniest moment you shared' },
    answers: { adventures: 'Your childhood adventures together' },
    letter: true,
    photos: ['sample-03.jpg'],
    portrait: 'sample-10.jpg',
  },
  {
    name: 'Sample School Friend',
    relationship: 'Friend from school (sample)',
    category: 'friend',
    timeline: { precision: 'specific_year', year: 2012, lifeStage: null },
    nameVisibility: 'full_name',
    memories: { favourite: 'A favourite memory with Roni' },
    answers: { howWeMet: 'How did you meet?' },
    letter: false,
    photos: ['sample-04.jpg'],
    portrait: null,
  },
  {
    name: 'Sample University Friend',
    relationship: 'University friend (sample)',
    category: 'friend',
    timeline: { precision: 'specific_year', year: 2018, lifeStage: null },
    nameVisibility: 'full_name',
    memories: { unknownFact: 'Something people might not know about Roni' },
    answers: { sharedExperiences: 'Experiences you shared' },
    letter: true,
    photos: ['sample-05.jpg', 'sample-06.jpg'],
    portrait: 'sample-11.jpg',
    featured: true,
  },
  {
    name: 'Sample Colleague',
    relationship: 'Colleague (sample)',
    category: 'friend',
    timeline: { precision: 'specific_year', year: 2026, lifeStage: null },
    nameVisibility: 'full_name',
    memories: { favourite: 'A favourite memory with Roni' },
    answers: { friendshipMoments: 'Moments that shaped your friendship' },
    letter: false,
    photos: ['sample-07.jpg'],
    portrait: 'sample-12.jpg',
  },
  {
    name: 'Sample Anonymous Friend',
    relationship: 'Friend (sample)',
    category: 'friend',
    timeline: { precision: 'unknown', year: null, lifeStage: null },
    nameVisibility: 'anonymous',
    memories: { funniest: 'The funniest moment you shared' },
    answers: {},
    letter: false,
    photos: [],
    portrait: null,
  },
]

async function upload(token, contributionId, purpose, file) {
  const buffer = await photo(file)
  const prepared = await contribute({ action: 'upload-url', token, contributionId, purpose, fileName: file, mimeType: 'image/jpeg', size: buffer.length })
  const put = await fetch(prepared.signedUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }, body: buffer })
  if (!put.ok) throw new Error(`upload ${file}: ${put.status}`)
  await contribute({ action: 'finalize-upload', token, contributionId, mediaId: prepared.mediaId })
}

async function seedPerson(p, adminId) {
  const contributor = must(
    'contributor',
    await db
      .from('contributors')
      .insert({ full_name: p.name, relationship: p.relationship, category: p.category, is_sample: true, created_by: adminId })
      .select('id')
      .single(),
  )
  const [invite] = must('invitation', await db.rpc('admin_create_invitation', { p_contributor_id: contributor.id, p_expires_in_days: 7 }))
  const token = invite.token

  // The contributor's side, through the same edge function the studio uses.
  const { contributionId } = await contribute({ action: 'start', token })
  const session = await contribute({ action: 'session', token })
  const draft = session.current.draft
  const payload = structuredClone(draft.payload)
  for (const [key, question] of Object.entries(p.memories))
    payload.memories[key] = answer(p.name, question, key === 'favourite' ? 'Longer stories keep their paragraphs. This second paragraph shows how a longer memory reads when it is opened from the Memory Vault.' : '')
  for (const [key, question] of Object.entries(p.answers)) payload.categoryAnswers[key] = answer(p.name, question)
  payload.celebrating.admire = answer(p.name, 'What do you admire most about her?')
  payload.message.turningThirty = `Sample message from ${p.name} for Roni turning thirty. It appears on their card in Through Their Eyes.`
  payload.message.nextDecadeWish = `Sample wish from ${p.name}: one or two sentences of hope for Roni’s next ten years. Each wish lights a star.`
  if (p.letter)
    payload.letter.body = [
      `This is a sample letter from ${p.name}. Letters from family and friends are sealed in envelopes in Words Worth Keeping and open into a page like this one.`,
      'A real letter can be as long as the writer likes. It keeps its paragraphs and line breaks, and if they recorded a voice note, Roni can listen to it here too.',
      `With love,\n${p.name}`,
    ].join('\n\n')
  payload.timeline = p.timeline
  payload.consent = { permission: true, nameVisibility: p.nameVisibility, messageVisibility: 'everyone' }
  await contribute({ action: 'save', token, contributionId, payload, step: 7, version: draft.version })
  for (const file of p.photos) await upload(token, contributionId, 'photo', file)
  if (p.portrait) await upload(token, contributionId, 'profile_photo', p.portrait)
  await contribute({ action: 'submit', token, contributionId, payload, idempotencyKey: randomUUID() })

  // The curator's side: approve, add to the archive, publish.
  must('approve', await db.rpc('admin_review_contribution', { p_contribution_id: contributionId, p_action: 'approved' }))
  const items = [...Object.keys(p.memories).map((k) => [k, payload.memories[k]]), ...Object.keys(p.answers).map((k) => [k, payload.categoryAnswers[k]])]
  must(
    'import',
    await db.rpc('admin_import_contribution', {
      p_contribution_id: contributionId,
      p_items: {
        memories: items.map(([k, story]) => ({ title: TITLES[k], story, category: categoryFor(k, p.category) })),
        wish: payload.message.nextDecadeWish,
        letter: payload.letter.body,
        profile_message: payload.message.turningThirty,
      },
    }),
  )
  must(
    'media',
    await db
      .from('media_assets')
      .update({ is_published: true, alt_text: 'Sample placeholder image', caption: `Sample photo uploaded by ${p.name}` })
      .eq('contribution_id', contributionId),
  )
  must('memories', await db.from('memories').update({ is_published: true }).eq('contribution_id', contributionId))
  if (p.featured) {
    const first = must('first memory', await db.from('memories').select('id').eq('contribution_id', contributionId).order('sort_order').limit(1))
    if (first[0]) must('feature', await db.from('memories').update({ is_featured: true }).eq('id', first[0].id))
  }
  must('wishes', await db.from('birthday_wishes').update({ is_published: true }).eq('contribution_id', contributionId))
  must('letters', await db.from('letters').update({ is_published: true }).eq('contribution_id', contributionId))
  must('profile', await db.from('contributor_profiles').update({ is_published: true }).eq('contributor_id', contributor.id))
  must(
    'revoke',
    await db
      .from('invitations')
      .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_by: adminId })
      .eq('contributor_id', contributor.id)
      .eq('status', 'active'),
  )
  console.log(`  ${p.name}: submitted, approved, added and published`)
  return contributionId
}

async function curatedPhoto(file, collectionId, adminId, caption) {
  const buffer = await photo(file)
  const path = `original/${randomUUID()}.jpg`
  must('storage', await db.storage.from('archive').upload(path, buffer, { contentType: 'image/jpeg', upsert: false }))
  const portrait = file >= 'sample-09'
  const row = must(
    'curated media',
    await db
      .from('media_assets')
      .insert({
        bucket: 'archive',
        storage_path: path,
        kind: 'image',
        purpose: 'curated',
        status: 'verified',
        verified_at: new Date().toISOString(),
        mime_type: 'image/jpeg',
        size_bytes: buffer.length,
        original_filename: file,
        width: portrait ? 1280 : 1600,
        height: portrait ? 1600 : 1200,
        collection_id: collectionId,
        uploaded_by: adminId,
        alt_text: 'Sample placeholder image',
        caption,
        is_sample: true,
        is_published: true,
      })
      .select('id')
      .single(),
  )
  return row.id
}

// ---------------------------------------------------------------------------
const auth = must('sign in', await db.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }))
const adminId = auth.user.id
const existing = must('check', await db.from('contributors').select('id', { count: 'exact' }).eq('is_sample', true))
if (existing.length) {
  console.error('Sample content already exists. Remove it from the dashboard Overview first.')
  process.exit(1)
}
const collection = must('collection', await db.from('archive_collections').select('id').eq('kind', 'original_thirty').single())

console.log('Sample contributors (through the contributor studio):')
for (const p of PEOPLE) await seedPerson(p, adminId)

console.log('Wishes: placing stars')
const wishes = must('wishes', await db.from('birthday_wishes').select('id').eq('is_sample', true).order('created_at'))
const stars = [3, 8, 13, 19, 24, 30]
must(
  'arrange',
  await db.rpc('admin_arrange_wishes', {
    p_assignments: wishes.map((w, i) => ({ id: w.id, star: stars[i] })),
    p_final: wishes.at(-1)?.id ?? null,
  }),
)

const parentLetter = must('letters', await db.from('letters').select('id').eq('is_sample', true).order('created_at').limit(1))
if (parentLetter[0]) must('featured letter', await db.from('letters').update({ is_featured: true }).eq('id', parentLetter[0].id))

console.log('Timeline: sample milestones')
const MILESTONES = [
  { chapter: 'beginning', year: 1996, age: 0, file: 'sample-02.jpg' },
  { chapter: 'becoming', year: 2008, age: 12, file: 'sample-04.jpg' },
  { chapter: 'finding_her_way', year: 2018, age: 22, file: 'sample-06.jpg' },
  { chapter: 'thirty', year: 2026, age: 30, file: 'sample-08.jpg' },
]
const memories = must('memories', await db.from('memories').select('id, chapter').eq('is_sample', true))
for (const [i, m] of MILESTONES.entries()) {
  const mediaId = await curatedPhoto(m.file, collection.id, adminId, `Sample photo for a ${m.year} milestone`)
  const row = must(
    'milestone',
    await db
      .from('timeline_milestones')
      .insert({
        collection_id: collection.id,
        chapter: m.chapter,
        year: m.year,
        age: m.age,
        title: `Sample milestone · ${m.year}`,
        description:
          'Sample. Curators write milestones in Timeline: a year, a title, a few lines and photos. Memories from contributors can be linked to them, like the ones below.',
        featured_media_id: mediaId,
        is_published: true,
        is_sample: true,
        sort_order: i,
        created_by: adminId,
      })
      .select('id')
      .single(),
  )
  const linked = memories.filter((x) => x.chapter === m.chapter).slice(0, 2)
  if (linked.length)
    must('links', await db.from('milestone_memories').insert(linked.map((x, j) => ({ milestone_id: row.id, memory_id: x.id, sort_order: j }))))
}

console.log('Editorial: sample Roni Times and final message')
const cover = await curatedPhoto('sample-05.jpg', collection.id, adminId, 'Sample cover photo')
const feature1 = await curatedPhoto('sample-07.jpg', collection.id, adminId, 'Sample photo feature')
const feature2 = await curatedPhoto('sample-03.jpg', collection.id, adminId, 'Sample photo feature')
const story = (title, byline, mediaId = null) => ({
  title,
  body: 'Sample story. The Roni Times is written by curators in Editorial, often from what contributors shared. This paragraph is a placeholder for a real article.',
  byline,
  mediaId,
})
const times = {
  masthead: 'THE RONI TIMES',
  edition: 'SPECIAL 30TH BIRTHDAY EDITION',
  dateline: 'Thursday, 3 December 2026',
  headline: 'LOCAL ICON TURNS THIRTY.',
  standfirst: 'Sample edition. Every story on this page is a placeholder showing where the curators’ writing will go.',
  coverStory: story('Sample cover story', 'Sample byline', cover),
  thirtyThings: Array.from({ length: 6 }, (_, i) => `Sample thing #${i + 1}. Curators can list up to thirty things about Roni here.`),
  familyMemories: [story('Sample family memory', 'Sample family member')],
  friendshipChronicles: [story('Sample friendship chronicle', 'Sample friend')],
  awards: [
    { title: 'Sample award', citation: 'A playful award and the reason for it, written by the curators.' },
    { title: 'Another sample award', citation: 'Awards are optional; only the ones written are printed.' },
  ],
  forecast: 'Sample forecast. A light-hearted “birthday forecast” for the year ahead goes here.',
  photoFeatures: [
    { mediaId: feature1, caption: 'Sample photo feature caption' },
    { mediaId: feature2, caption: 'Another sample caption' },
  ],
}
const finale = {
  heading: 'HAPPY 30TH BIRTHDAY, RONI.',
  lines: ['Thirty years of stories.', 'Thirty years of becoming.', 'And a lifetime of beautiful possibilities ahead.'],
  finalMessage: 'Sample final message. After Roni makes her wish, the curators’ closing words appear here. Write the real message in Editorial → Finale.',
  finalSignature: 'Sample signature',
}
must(
  'editorial',
  await db.from('experience_content').upsert(
    [
      { key: 'roni_times', content: times, is_published: true, is_sample: true, updated_by: adminId },
      { key: 'finale', content: finale, is_published: true, is_sample: true, updated_by: adminId },
    ],
    // Never overwrite editorial copy a curator has already written.
    { onConflict: 'key', ignoreDuplicates: true },
  ),
)

console.log('Done. Open the site as a curator with Curator preview on to see it.')
await db.auth.signOut()
