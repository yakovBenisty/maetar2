import type { ColDef } from 'ag-grid-community'

/**
 * פילטר העמודות בגרידים: רץ רק כשההקלדה נעצרת לרגע, ולא בכל אות. בטבלאות גדולות (עשרות אלפי
 * שורות) סינון בכל הקשה חוסם את הדפדפן ותוקע את המשך ההקלדה בתיבת הסינון.
 */
export const FILTER_DEBOUNCE_MS = 600

export const defaultColDefWithFilter: ColDef = {
  sortable: true,
  resizable: true,
  filter: true,
  filterParams: { debounceMs: FILTER_DEBOUNCE_MS },
}
