import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongo';

const REPORT_COLLECTIONS = ['CHESHBONIT', 'MUCARIM', 'SHARATIM', 'YADANIIM', 'COMMANDS'];

export async function GET() {
  try {
    const db = await getDb();

    // שלב 1: קבל נושאים מ-NOSEME (עם שמות אם קיימים)
    const nosemeDocs = await db
      .collection('NOSEME')
      .find({})
      .sort({ code: 1 })
      .project({ _id: 0, code: 1, name: 1, table_type: 1 })
      .toArray();

    // בנה מיפוי קוד → שם מ-NOSEME
    const nameMap = new Map<string, string>();
    for (const doc of nosemeDocs) {
      if (doc.name) nameMap.set(String(doc.code), String(doc.name));
    }

    // שלב 2: אסוף קודי נושא + שמות מכל אוספי הדוחות
    for (const colName of REPORT_COLLECTIONS) {
      try {
        const colTopics = await db
          .collection(colName)
          .aggregate([
            { $group: { _id: '$קוד_נושא', name: { $first: '$תאור_נושא' } } },
            { $sort: { _id: 1 } },
          ])
          .toArray();

        for (const doc of colTopics) {
          const code = String(doc._id ?? '');
          if (!code || code === 'null' || code === 'undefined') continue;
          const name = doc.name ? String(doc.name) : '';
          // רק עדכן שם אם עדיין אין שם למפה זו
          if (name && !nameMap.has(code)) {
            nameMap.set(code, name);
          }
        }
      } catch {
        // אם אוסף לא קיים, המשך
      }
    }

    // שלב 3: בנה רשימה מאוחדת — עדיפות ל-NOSEME, גיבוי מאוספים אחרים
    const codeSet = new Set<string>();
    const topics: { code: string; name: string; table_type?: string }[] = [];

    for (const doc of nosemeDocs) {
      const code = String(doc.code);
      const name = doc.name || nameMap.get(code) || '';
      codeSet.add(code);
      topics.push({ code, name, table_type: doc.table_type });
    }

    // הוסף קודים שנמצאו באוספים אך לא ב-NOSEME
    for (const [code, name] of nameMap.entries()) {
      if (!codeSet.has(code)) {
        codeSet.add(code);
        topics.push({ code, name });
      } else {
        // עדכן שם חסר בנושאים מ-NOSEME
        const existing = topics.find((t) => t.code === code);
        if (existing && !existing.name && name) existing.name = name;
      }
    }

    // מיין לפי קוד
    topics.sort((a, b) => {
      const na = Number(a.code);
      const nb = Number(b.code);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.code.localeCompare(b.code);
    });

    return NextResponse.json({ topics });
  } catch (error) {
    return NextResponse.json(
      { topics: [], error: error instanceof Error ? error.message : 'שגיאה' },
      { status: 500 }
    );
  }
}
