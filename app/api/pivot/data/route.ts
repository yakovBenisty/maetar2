import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongo'

export async function POST(req: Request) {
  try {
    const { collection, limit = 50000 } = await req.json() as { collection: string; limit?: number }
    if (!collection) return NextResponse.json({ error: 'missing collection' }, { status: 400 })

    const db = await getDb()
    const rows = await db.collection(collection)
      .find({}, { projection: { _id: 0 } })
      .limit(limit)
      .toArray()

    // Serialize Date → "MM/YYYY"
    const serialized = rows.map(row => {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(row)) {
        if (v instanceof Date) {
          out[k] = `${String(v.getUTCMonth() + 1).padStart(2, '0')}/${v.getUTCFullYear()}`
        } else {
          out[k] = v
        }
      }
      return out
    })

    return NextResponse.json({ data: serialized, count: serialized.length })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
