// חודש_חישוב / חודש_תחולה נשמרים ב-Mongo בשלושה פורמטים שונים בפועל
// (Date, מספר YYYYMM, מחרוזת "YYYY/MM") — תלוי אם הערך המקורי ב-CSV עמד
// בפורמט MM/YYYY שהאימפורט יודע לפרסר. פונקציה זו מאחדת את כל הפורמטים
// הללו למספר YYYYMM יחיד בתוך pipeline של aggregation, לסינון/קיבוץ נכון
// בלי לפספס שורות שהשדה בהן אינו מסוג Date. משותף בין /api/reports/query
// ל-/api/reports/income.
export function yyyymmExprFromField(field: string) {
  return {
    $switch: {
      branches: [
        {
          case: { $eq: [{ $type: `$${field}` }, 'date'] },
          then: { $add: [{ $multiply: [{ $year: `$${field}` }, 100] }, { $month: `$${field}` }] },
        },
        {
          case: { $eq: [{ $type: `$${field}` }, 'string'] },
          then: {
            $let: {
              vars: { parts: { $split: [`$${field}`, '/'] } },
              in: {
                $cond: [
                  { $eq: [{ $size: '$$parts' }, 2] },
                  {
                    $add: [
                      { $multiply: [{ $convert: { input: { $arrayElemAt: ['$$parts', 0] }, to: 'int', onError: null, onNull: null } }, 100] },
                      { $convert: { input: { $arrayElemAt: ['$$parts', 1] }, to: 'int', onError: null, onNull: null } },
                    ],
                  },
                  null,
                ],
              },
            },
          },
        },
        {
          case: { $in: [{ $type: `$${field}` }, ['int', 'long', 'double', 'decimal']] },
          then: `$${field}`,
        },
      ],
      default: null,
    },
  };
}

export function monthToYYYYMM(monthStr: string): number {
  const [y, m] = monthStr.split('-').map(Number);
  return y * 100 + m;
}
