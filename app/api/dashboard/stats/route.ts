import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongo';
import { CONFIG } from '@/config';

export async function GET() {
  try {
    const db = await getDb();

    const collectionNames = Object.values(CONFIG.collections);

    const counts = await Promise.all(
      collectionNames.map(async (col) => {
        try {
          const count = await db.collection(col).countDocuments();
          return { name: col, count };
        } catch {
          return { name: col, count: 0 };
        }
      })
    );

    const commandsCount = counts.find((c) => c.name === 'COMMANDS')?.count ?? 0;
    const runsCount = counts.find((c) => c.name === 'runs')?.count ?? 0;

    let errorRunsCount = 0;
    try {
      errorRunsCount = await db.collection('runs').countDocuments({ status: 'error' });
    } catch {
      errorRunsCount = 0;
    }

    return NextResponse.json({
      connected: true,
      commandsCount,
      runsCount,
      errorRunsCount,
      collections: counts,
    });
  } catch (error) {
    return NextResponse.json(
      {
        connected: false,
        commandsCount: 0,
        runsCount: 0,
        errorRunsCount: 0,
        collections: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
