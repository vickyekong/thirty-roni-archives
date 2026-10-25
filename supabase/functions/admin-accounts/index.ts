// Account management for the curator. Creating, resetting and deleting Supabase Auth
// users needs the secret key, so it lives here rather than in the browser. Every
// request must carry a signed-in user's access token, and that user must hold the
// admin role in user_roles; the frontend's hidden buttons are not the security.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'zod'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS')
const SERVICE_KEY: string = secretKeys
  ? JSON.parse(secretKeys).default
  : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

const ROLES = ['admin', 'roni', 'family_viewer'] as const
type Role = (typeof ROLES)[number]

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    ALLOWED_ORIGINS.length === 0 ? '*' : origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

// 4 groups of 5 from an alphabet without look-alike characters (~115 bits).
function generatePassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const limit = 256 - (256 % alphabet.length)
  const out: string[] = []
  while (out.length < 20) {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    for (const b of bytes) {
      if (b < limit && out.length < 20) out.push(alphabet[b % alphabet.length])
    }
  }
  return [0, 5, 10, 15].map((i) => out.slice(i, i + 5).join('')).join('-')
}

async function requireAdmin(req: Request): Promise<string> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'unauthenticated', 'Sign in to manage accounts.')
  const { data, error } = await db.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'unauthenticated', 'Your session has expired. Sign in again.')
  const { data: role } = await db
    .from('user_roles')
    .select('role')
    .eq('user_id', data.user.id)
    .eq('role', 'admin')
    .maybeSingle()
  if (!role) throw new HttpError(403, 'forbidden', 'Only the curator can manage accounts.')
  return data.user.id
}

async function audit(actorId: string, action: string, entityId: string | null, details: Record<string, unknown>) {
  const { error } = await db.from('audit_logs').insert({
    actor_type: 'user',
    actor_id: actorId,
    action,
    entity_type: 'account',
    entity_id: entityId,
    details,
  })
  if (error) console.error('audit insert failed', error.message)
}

const requestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }),
  z.object({
    action: z.literal('create'),
    email: z.string().trim().toLowerCase().pipe(z.email()),
    displayName: z.string().trim().min(1).max(120),
    roles: z.array(z.enum(ROLES)).min(1),
  }),
  z.object({ action: z.literal('set_roles'), userId: z.uuid(), roles: z.array(z.enum(ROLES)) }),
  z.object({ action: z.literal('reset_password'), userId: z.uuid() }),
  z.object({ action: z.literal('delete'), userId: z.uuid() }),
])

async function listAccounts() {
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error) throw new HttpError(500, 'list_failed', 'Could not load accounts.')
  const ids = data.users.map((u) => u.id)
  const [{ data: roles }, { data: profiles }] = await Promise.all([
    db.from('user_roles').select('user_id, role').in('user_id', ids),
    db.from('profiles').select('id, display_name').in('id', ids),
  ])
  return data.users
    .map((u) => ({
      id: u.id,
      email: u.email ?? null,
      displayName: profiles?.find((p) => p.id === u.id)?.display_name ?? null,
      roles: (roles ?? []).filter((r) => r.user_id === u.id).map((r) => r.role as Role),
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

async function replaceRoles(userId: string, roles: Role[], grantedBy: string) {
  const unique = [...new Set(roles)]
  const { error: delError } = await db.from('user_roles').delete().eq('user_id', userId)
  if (delError) throw new HttpError(500, 'roles_failed', 'Could not update roles.')
  if (unique.length > 0) {
    const { error } = await db
      .from('user_roles')
      .insert(unique.map((role) => ({ user_id: userId, role, granted_by: grantedBy })))
    if (error) throw new HttpError(500, 'roles_failed', 'Could not update roles.')
  }
}

async function ownsCollection(userId: string): Promise<boolean> {
  const { count } = await db
    .from('archive_collections')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', userId)
  return (count ?? 0) > 0
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin)

  try {
    const actorId = await requireAdmin(req)
    let body: unknown
    try {
      body = await req.json()
    } catch {
      throw new HttpError(400, 'invalid_request', 'The request could not be read.')
    }
    const parsed = requestSchema.safeParse(body)
    if (!parsed.success) throw new HttpError(400, 'invalid_request', 'Check the details and try again.')
    const input = parsed.data

    switch (input.action) {
      case 'list':
        return json({ accounts: await listAccounts() }, 200, origin)

      case 'create': {
        const password = generatePassword()
        const { data, error } = await db.auth.admin.createUser({
          email: input.email,
          password,
          email_confirm: true,
          user_metadata: { display_name: input.displayName },
        })
        if (error || !data.user) {
          const exists = /already|registered|exists/i.test(error?.message ?? '')
          throw new HttpError(
            exists ? 409 : 500,
            exists ? 'email_exists' : 'create_failed',
            exists ? 'An account with that email already exists.' : 'Could not create the account.',
          )
        }
        const userId = data.user.id
        await db.from('profiles').upsert({ id: userId, display_name: input.displayName })
        await replaceRoles(userId, input.roles, actorId)
        await audit(actorId, 'account_created', userId, { roles: input.roles })
        return json({ userId, email: input.email, password }, 201, origin)
      }

      case 'set_roles': {
        if (input.userId === actorId && !input.roles.includes('admin')) {
          throw new HttpError(409, 'self_lockout', 'You cannot remove your own curator access.')
        }
        await replaceRoles(input.userId, input.roles, actorId)
        await audit(actorId, 'account_roles_changed', input.userId, { roles: input.roles })
        return json({ ok: true }, 200, origin)
      }

      case 'reset_password': {
        const password = generatePassword()
        const { error } = await db.auth.admin.updateUserById(input.userId, { password })
        if (error) throw new HttpError(500, 'reset_failed', 'Could not reset the password.')
        await audit(actorId, 'account_password_reset', input.userId, {})
        return json({ password }, 200, origin)
      }

      case 'delete': {
        if (input.userId === actorId) {
          throw new HttpError(409, 'self_delete', 'You cannot delete your own account.')
        }
        if (await ownsCollection(input.userId)) {
          throw new HttpError(
            409,
            'owns_collection',
            'This person has their own archive, so the account is kept. Remove their roles instead.',
          )
        }
        const { error } = await db.auth.admin.deleteUser(input.userId)
        if (error) throw new HttpError(500, 'delete_failed', 'Could not delete the account.')
        await audit(actorId, 'account_deleted', input.userId, {})
        return json({ ok: true }, 200, origin)
      }
    }
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.code, message: err.message }, err.status, origin)
    console.error('admin-accounts failure', err)
    return json({ error: 'server_error', message: 'Something went wrong.' }, 500, origin)
  }
})
