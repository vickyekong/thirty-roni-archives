// End-to-end smoke test for the `contribute` edge function.
// Usage:
//   SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... INVITE_TOKEN=... node scripts/smoke-contribute.mjs
// Requires an active invitation with no open draft. The run leaves one submitted contribution behind.
import { randomUUID } from 'node:crypto'

const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, INVITE_TOKEN } = process.env
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !INVITE_TOKEN) {
  console.error('Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and INVITE_TOKEN')
  process.exit(1)
}

const endpoint = `${SUPABASE_URL}/functions/v1/contribute`
const results = []

async function call(body) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

function check(name, condition, detail) {
  results.push({ name, pass: Boolean(condition) })
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : `  ->  ${JSON.stringify(detail)}`}`)
}

const jpeg = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  Buffer.from('JFIF\0'),
  Buffer.alloc(256, 0x20),
  Buffer.from([0xff, 0xd9]),
])
const fakeJpeg = Buffer.from('this is plain text pretending to be a photograph')

async function upload(contributionId, purpose, buffer, mimeType, fileName) {
  const prepared = await call({
    action: 'upload-url',
    token: INVITE_TOKEN,
    contributionId,
    purpose,
    fileName,
    mimeType,
    size: buffer.length,
  })
  if (!prepared.body.ok) return { prepared }
  const put = await fetch(prepared.body.data.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType, 'x-upsert': 'false' },
    body: buffer,
  })
  const finalized = await call({
    action: 'finalize-upload',
    token: INVITE_TOKEN,
    contributionId,
    mediaId: prepared.body.data.mediaId,
  })
  return { prepared, putStatus: put.status, finalized }
}

// Invalid and malformed tokens
let r = await call({ action: 'session', token: 'A'.repeat(43) })
check('unknown token is rejected (401)', r.status === 401 && r.body.error.code === 'invalid_invitation', r)
r = await call({ action: 'session', token: 'short' })
check('malformed token is rejected (400)', r.status === 400, r)
r = await call({ action: 'drop-tables', token: INVITE_TOKEN })
check('unknown action is rejected (400)', r.status === 400, r)

// Session and start
r = await call({ action: 'session', token: INVITE_TOKEN })
check('valid token opens a session', r.status === 200 && r.body.data.contributor.category, r)
check('session exposes no other contributors', !JSON.stringify(r.body).includes('token_hash'), r)

r = await call({ action: 'start', token: INVITE_TOKEN })
check('start creates a draft', r.status === 200 && r.body.data.contributionId, r)
const contributionId = r.body.data.contributionId
r = await call({ action: 'start', token: INVITE_TOKEN })
check('second start reuses the same draft (no duplicates)', r.body.data?.contributionId === contributionId, r)

r = await call({ action: 'session', token: INVITE_TOKEN })
const draft = r.body.data.current.draft
check('draft is prefilled with the invited name', draft.payload.introduction.fullName.length > 0, draft)

// Autosave with optimistic concurrency
const payload = structuredClone(draft.payload)
payload.memories.favourite = '[TEST] Automated smoke test memory.'
payload.message.turningThirty = '[TEST] Automated smoke test message.'
r = await call({ action: 'save', token: INVITE_TOKEN, contributionId, payload, step: 2, version: draft.version })
check('save succeeds and bumps version', r.status === 200 && r.body.data.version === draft.version + 1, r)
const savedVersion = r.body.data.version
r = await call({ action: 'save', token: INVITE_TOKEN, contributionId, payload, step: 2, version: draft.version })
check('stale save returns version conflict (409) with latest copy', r.status === 409 && r.body.error.latest, r)

r = await call({
  action: 'save',
  token: INVITE_TOKEN,
  contributionId,
  payload: { ...payload, injected: '<script>alert(1)</script>' },
  step: 2,
  version: savedVersion,
})
check('unknown payload fields are rejected', r.status === 400, r)

r = await call({ action: 'save', token: INVITE_TOKEN, contributionId: randomUUID(), payload, step: 2, version: 1 })
check("cannot save into someone else's contribution id", r.status === 404, r)

// Uploads
let u = await upload(contributionId, 'photo', jpeg, 'image/jpeg', 'test-photo.jpg')
check('real JPEG upload is verified', u.putStatus === 200 && u.finalized?.body.ok && u.finalized.body.data.media, u)
const mediaId = u.prepared.body.data?.mediaId

u = await upload(contributionId, 'photo', fakeJpeg, 'image/jpeg', 'fake.jpg')
check('file with a forged type is rejected', u.finalized?.status === 422 && u.finalized.body.error.code === 'invalid_file', u)

r = await call({
  action: 'upload-url',
  token: INVITE_TOKEN,
  contributionId,
  purpose: 'photo',
  fileName: 'x.exe',
  mimeType: 'application/x-msdownload',
  size: 100,
})
check('disallowed MIME type is refused before upload', r.status === 422 && r.body.error.code === 'unsupported_type', r)

r = await call({
  action: 'upload-url',
  token: INVITE_TOKEN,
  contributionId,
  purpose: 'video',
  fileName: 'huge.mp4',
  mimeType: 'video/mp4',
  size: 500 * 1024 * 1024,
})
check('oversized file is refused before upload', r.status === 422 && r.body.error.code === 'too_large', r)

// Submission
r = await call({ action: 'submit', token: INVITE_TOKEN, contributionId, payload, idempotencyKey: randomUUID() })
check('submit without consent is refused with a clear message', r.status === 422 && r.body.error.code === 'incomplete', r)

payload.consent.permission = true
const idempotencyKey = randomUUID()
r = await call({ action: 'submit', token: INVITE_TOKEN, contributionId, payload, idempotencyKey })
check('submit succeeds', r.status === 200 && r.body.data.duplicate === false, r)
r = await call({ action: 'submit', token: INVITE_TOKEN, contributionId, payload, idempotencyKey })
check('repeated submit is idempotent', r.status === 200 && r.body.data.duplicate === true, r)
r = await call({ action: 'submit', token: INVITE_TOKEN, contributionId, payload, idempotencyKey: randomUUID() })
check('a second, different submit is refused', r.status === 409, r)

r = await call({ action: 'save', token: INVITE_TOKEN, contributionId, payload, step: 7, version: savedVersion + 1 })
check('submitted contribution can no longer be edited', r.status === 409 && r.body.error.code === 'not_editable', r)
r = await call({ action: 'delete-media', token: INVITE_TOKEN, contributionId, mediaId })
check('submitted media can no longer be deleted', r.status === 409, r)

r = await call({ action: 'session', token: INVITE_TOKEN })
check('session shows the submission and no open draft', r.body.data.current === null && r.body.data.submitted.length >= 1, r)

r = await call({ action: 'removal-request', token: INVITE_TOKEN, contributionId, details: '[TEST] removal request' })
check('removal request is recorded', r.status === 200 && r.body.data.requestId, r)

const failed = results.filter((x) => !x.pass).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
