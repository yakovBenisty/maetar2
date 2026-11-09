import { NextRequest, NextResponse } from 'next/server';
import { importFiles } from '@/lib/import-engine';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const strategy = (formData.get('strategy') as string) === 'replace' ? 'replace' : 'skip';
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ ok: false, error: 'לא נבחרו קבצים' }, { status: 400 });
    }

    const inputFiles = await Promise.all(
      files.map(async (file) => ({
        filename: (file.name ?? '').split('/').pop()?.split('\\').pop() ?? file.name,
        buffer: Buffer.from(await file.arrayBuffer()),
      }))
    );

    const { runId, summary } = await importFiles(inputFiles, strategy);

    return NextResponse.json({ ok: true, runId, summary });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'שגיאת שרת', summary: [] },
      { status: 500 }
    );
  }
}
