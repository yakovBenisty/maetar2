// קליינט לאיסוף קבצי "דו"חות מית"ר" (משרד החינוך, apps.education.gov.il/mtrnet).
// האתר אינו דורש התחברות (GUEST) אך שומר את בחירת המוטב ב-session; לכן יש לבצע
// GET ואז שני POST-ים (חיפוש + בחירת שורה) עם אותן עוגיות, בדיוק כפי שדפדפן רגיל היה עושה.

const BASE = 'https://apps.education.gov.il';
const HOME_PATH = '/mtrnet/home.aspx';

const FIELD_RBTN_MTV = 'ctl00$Main$rbtnMtv';
const FIELD_RBL_INP = 'ctl00$Main$rblInp';
const FIELD_INP_SML = 'ctl00$Main$inpSml';
const FIELD_INP_SHEM = 'ctl00$Main$inpShem';
const FIELD_BTN_OK = 'ctl00$Main$btnOK';

export interface MitarMonth {
  month: number;
  year: number;
  label: string;
}

type CookieJar = Map<string, string>;

function mergeCookies(jar: CookieJar, res: Response): void {
  const headersWithGetSetCookie = res.headers as Headers & { getSetCookie?: () => string[] };
  const setCookies =
    typeof headersWithGetSetCookie.getSetCookie === 'function'
      ? headersWithGetSetCookie.getSetCookie()
      : res.headers.get('set-cookie')
        ? [res.headers.get('set-cookie') as string]
        : [];

  for (const raw of setCookies) {
    const pair = raw.split(';')[0];
    const idx = pair.indexOf('=');
    if (idx > -1) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

function cookieHeader(jar: CookieJar): string {
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function extractInputValue(html: string, name: string): string {
  const nameEsc = name.replace(/[$]/g, '\\$');
  const tagRe = new RegExp(`<input[^>]*name=["']${nameEsc}["'][^>]*>`, 'i');
  const tagMatch = tagRe.exec(html);
  if (!tagMatch) return '';
  const valueMatch = /value=["']([^"']*)["']/i.exec(tagMatch[0]);
  if (!valueMatch) return '';
  return valueMatch[1]
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

async function postForm(jar: CookieJar, path: string, fields: Record<string, string>): Promise<Response> {
  const body = new URLSearchParams(fields);
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Cookie: cookieHeader(jar),
    },
    body: body.toString(),
    redirect: 'manual',
  });
  mergeCookies(jar, res);
  return res;
}

async function followRedirectIfAny(jar: CookieJar, res: Response, fromPath: string): Promise<void> {
  if (res.status < 300 || res.status >= 400) return;
  const location = res.headers.get('location');
  if (!location) return;
  const redirectUrl = new URL(location, `${BASE}${fromPath}`).toString();
  const followed = await fetch(redirectUrl, {
    headers: { Cookie: cookieHeader(jar) },
    redirect: 'manual',
  });
  mergeCookies(jar, followed);
}

/**
 * פותח session במית"ר ובוחר את המוטב הנתון (לפי סמל), ומחזיר מחרוזת Cookie
 * לשימוש בבקשות ההמשך (רשימת חודשים + הורדת קובץ).
 */
export async function openMitarSession(beneficiaryCode: string): Promise<string> {
  const jar: CookieJar = new Map();

  const homeRes = await fetch(`${BASE}${HOME_PATH}`);
  mergeCookies(jar, homeRes);
  const homeHtml = await homeRes.text();

  const searchRes = await postForm(jar, HOME_PATH, {
    __LASTFOCUS: '',
    __EVENTTARGET: '',
    __EVENTARGUMENT: '',
    __VIEWSTATE: extractInputValue(homeHtml, '__VIEWSTATE'),
    __VIEWSTATEGENERATOR: extractInputValue(homeHtml, '__VIEWSTATEGENERATOR'),
    __PREVIOUSPAGE: extractInputValue(homeHtml, '__PREVIOUSPAGE'),
    'ctl00$cpe1_ClientState': 'false',
    [FIELD_RBTN_MTV]: '1', // מוטב
    [FIELD_RBL_INP]: '1', // לפי סמל
    [FIELD_INP_SML]: beneficiaryCode,
    [FIELD_INP_SHEM]: '',
    [FIELD_BTN_OK]: 'חפש',
  });
  const searchHtml = await searchRes.text();

  const rowMatch = /ctl00_Main_gvMtvList_RowClick\(event,(?:'|&#39;)([^'&]+)(?:'|&#39;)\)/.exec(searchHtml);
  if (!rowMatch) {
    throw new Error(`מוטב בקוד ${beneficiaryCode} לא נמצא במית"ר`);
  }
  const rowTarget = rowMatch[1];

  const selectRes = await postForm(jar, HOME_PATH, {
    __LASTFOCUS: '',
    __EVENTTARGET: rowTarget,
    __EVENTARGUMENT: '',
    __VIEWSTATE: extractInputValue(searchHtml, '__VIEWSTATE'),
    __VIEWSTATEGENERATOR: extractInputValue(searchHtml, '__VIEWSTATEGENERATOR'),
    __PREVIOUSPAGE: extractInputValue(searchHtml, '__PREVIOUSPAGE'),
    'ctl00$cpe1_ClientState': 'false',
    [FIELD_RBTN_MTV]: '1',
    [FIELD_RBL_INP]: '1',
    [FIELD_INP_SML]: beneficiaryCode,
    [FIELD_INP_SHEM]: '',
  });
  await followRedirectIfAny(jar, selectRes, HOME_PATH);

  return cookieHeader(jar);
}

/** מחזיר את רשימת החודשים הזמינים להורדה עבור המוטב שנבחר ב-session, מהחדש לישן. */
export async function listAvailableMonths(cookie: string): Promise<MitarMonth[]> {
  const res = await fetch(`${BASE}/MtrNet/horadatkv.aspx?slct=zip`, { headers: { Cookie: cookie } });
  if (!res.ok) throw new Error(`טעינת רשימת החודשים נכשלה (סטטוס ${res.status})`);
  const html = await res.text();

  const months: MitarMonth[] = [];
  const optionRe = /<option[^>]*value=["']Horada\.aspx\?date=(\d{1,2})_(\d{4})["'][^>]*>([^<]*)<\/option>/gi;
  let match: RegExpExecArray | null;
  while ((match = optionRe.exec(html))) {
    months.push({ month: Number(match[1]), year: Number(match[2]), label: match[3].trim() });
  }
  return months;
}

/** מוריד את קובץ ה-ZIP (14 קבצי ה-CSV) עבור חודש/שנה נתונים. */
export async function downloadMonthZip(cookie: string, month: number, year: number): Promise<Buffer> {
  const res = await fetch(`${BASE}/MtrNet/Horada.aspx?date=${month}_${year}`, { headers: { Cookie: cookie } });
  if (!res.ok) throw new Error(`הורדת הקובץ עבור ${month}/${year} נכשלה (סטטוס ${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    throw new Error(`הקובץ שהתקבל עבור ${month}/${year} אינו קובץ ZIP תקין`);
  }
  return buf;
}
