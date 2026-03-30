export class RelayObject {
  constructor(ctx, env) {
    this.sql = ctx.storage.sql
    this.sql.exec(`CREATE TABLE IF NOT EXISTS relay (
      guild_id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    )`)
  }

  async fetch(request) {
    const method = request.method

    if (method === 'GET') {
      const rows = [...this.sql.exec('SELECT data FROM relay WHERE guild_id = ?', 'default')]
      if (rows.length === 0) {
        return Response.json(null)
      }
      return new Response(rows[0].data, {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (method === 'PUT') {
      const data = await request.text()
      this.sql.exec('INSERT OR REPLACE INTO relay (guild_id, data) VALUES (?, ?)', 'default', data)
      return Response.json({ ok: true })
    }

    if (method === 'DELETE') {
      this.sql.exec('DELETE FROM relay WHERE guild_id = ?', 'default')
      return Response.json({ ok: true })
    }

    return new Response('Method Not Allowed', { status: 405 })
  }
}
