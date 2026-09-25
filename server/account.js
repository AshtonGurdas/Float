function httpError(message, status) {
  const error = new Error(message)
  error.status = status
  return error
}

function cleanEmail(value) {
  return String(value || '').trim().toLowerCase()
}

export async function registerAccount(client, body) {
  const email = cleanEmail(body.email)
  const password = String(body.password || '')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError('Enter a valid email.', 400)
  if (password.length < 8 || password.length > 72) throw httpError('Use at least 8 characters.', 400)

  const created = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (!created.error) return { ok: true }

  if (!/already been registered|already exists|already registered/i.test(created.error.message)) {
    throw httpError(created.error.message, 400)
  }

  const listed = await client.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (listed.error) throw httpError(listed.error.message, 500)
  const existing = (listed.data?.users || []).find((user) => cleanEmail(user.email) === email)
  if (!existing) throw httpError('That email already has an account. Sign in instead.', 409)
  if (existing.email_confirmed_at) throw httpError('That email already has an account. Sign in instead.', 409)

  const updated = await client.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
  })
  if (updated.error) throw httpError(updated.error.message, 400)
  return { ok: true }
}
