import { NextResponse } from 'next/server'
import { getDb } from '@/lib/mongo'
import { ObjectId } from 'mongodb'

export async function GET() {
  try {
    const db = await getDb()
    const reports = await db.collection('PIVOT_REPORTS').find({}).sort({ createdAt: -1 }).toArray()
    return NextResponse.json({
      reports: reports.map(r => ({
        ...r,
        _id: r._id.toString(),
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : null,
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { name, tabs } = await req.json()
    if (!name || !tabs) return NextResponse.json({ error: 'missing fields' }, { status: 400 })

    const db = await getDb()
    const result = await db.collection('PIVOT_REPORTS').insertOne({ name, tabs, createdAt: new Date() })
    return NextResponse.json({ ok: true, id: result.insertedId.toString() })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

    const db = await getDb()
    await db.collection('PIVOT_REPORTS').deleteOne({ _id: new ObjectId(id) })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
