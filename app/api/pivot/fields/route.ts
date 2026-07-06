import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongo'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const collection = searchParams.get('collection')
  if (!collection) return NextResponse.json({ error: 'missing collection' }, { status: 400 })

  try {
    const db = await getDb()
    const docs = await db.collection(collection)
      .find({}, { projection: { _id: 0 } })
      .limit(200)
      .toArray()

    const fieldsSet = new Set<string>()
    for (const doc of docs) {
      for (const key of Object.keys(doc)) fieldsSet.add(key)
    }

    return NextResponse.json({ fields: Array.from(fieldsSet).sort((a, b) => a.localeCompare(b, 'he')) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
