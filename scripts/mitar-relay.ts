// Relay שרץ ממחשב/שרת שפיזית בתוך רשת הרשות (לא מ-cloud) — כי אתר מית"ר
// (apps.education.gov.il) חוסם גישה מטווחי IP של ספקי cloud/datacenter.
// מוריד את הקבצים מהמית"ר (בדיוק כמו lib/mitar-sync.ts) ושולח כל ZIP חודשי
// ל-endpoint /api/mitar-sync/ingest בשרת ה-production, שמייבא אותו בפועל.
//
// הרצה: MITAR_INGEST_URL=... MITAR_INGEST_TOKEN=... npx tsx scripts/mitar-relay.ts
// מתוזמן (ללא מגע אדם) באמצעות Windows Task Scheduler / cron על המכונה המקומית.

import { openMitarSession, listAvailableMonths, downloadMonthZip } from '../lib/mitar-client';

const BENEFICIARY_CODE = process.env.MITAR_BENEFICIARY_CODE || '10402469';
const MONTHS_PER_RUN = Number(process.env.MITAR_SYNC_MONTHS_PER_RUN || 2);
const INGEST_URL = process.env.MITAR_INGEST_URL;
const INGEST_TOKEN = process.env.MITAR_INGEST_TOKEN;

async function main() {
  if (!INGEST_URL || !INGEST_TOKEN) {
    console.error('חובה להגדיר MITAR_INGEST_URL ו-MITAR_INGEST_TOKEN');
    process.exit(1);
  }

  console.log(`[${new Date().toISOString()}] פותח session מול מית"ר (מוטב ${BENEFICIARY_CODE})...`);
  const cookie = await openMitarSession(BENEFICIARY_CODE);
  const available = await listAvailableMonths(cookie);
  const toCheck = available.slice(0, MONTHS_PER_RUN);
  console.log(`נמצאו ${available.length} חודשים זמינים, בודק ${toCheck.length} החדשים ביותר.`);

  let hadError = false;

  for (const { month, year } of toCheck) {
    try {
      console.log(`מוריד ZIP עבור ${month}/${year}...`);
      const zipBuf = await downloadMonthZip(cookie, month, year);

      const form = new FormData();
      form.set('month', String(month));
      form.set('year', String(year));
      form.set('file', new Blob([new Uint8Array(zipBuf)]), `${month}_${year}.zip`);

      const res = await fetch(INGEST_URL, {
        method: 'POST',
        headers: { 'x-mitar-ingest-token': INGEST_TOKEN },
        body: form,
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.ok === false) {
        hadError = true;
        console.error(`שליחה עבור ${month}/${year} נכשלה (סטטוס ${res.status}):`, data?.error ?? data?.result?.error ?? '');
      } else {
        console.log(`${month}/${year} יובא בהצלחה.`, data?.result ?? data);
      }
    } catch (err) {
      hadError = true;
      console.error(`שגיאה בטיפול בחודש ${month}/${year}:`, err instanceof Error ? err.message : String(err));
    }
  }

  process.exit(hadError ? 1 : 0);
}

main().catch((err) => {
  console.error('ריצת ה-relay נכשלה:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
