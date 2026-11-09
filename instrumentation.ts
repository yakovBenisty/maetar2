export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.MITAR_SYNC_DISABLE_CRON === 'true') return;

  const cron = await import('node-cron');
  const { runMitarSync } = await import('@/lib/mitar-sync');

  // בדיקה יומית בחמשת ימי העבודה הראשונים של החודש (התאמה למועד העדכון המוצהר של מית"ר), 07:00.
  cron.schedule(
    '0 7 1-7 * *',
    () => {
      runMitarSync().catch((err) => {
        console.error('[mitar-sync] ריצה מתוזמנת נכשלה:', err);
      });
    },
    { timezone: 'Asia/Jerusalem' }
  );
}
