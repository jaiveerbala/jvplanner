// check-summer-programs
// Fetches each of the caller's summer program pages and pulls out anything
// that looks like an application open / due date, with the sentence it came
// from. It only REPORTS what it finds — it never edits a row. The app shows
// the findings and you confirm them with one tap.
//
// Reads programs with the caller's own login token, so row-level security
// applies: it can only ever see (and therefore fetch) the caller's own rows.
// No imports, no API keys, no secrets to set.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const FETCH_TIMEOUT_MS = 12000
const MAX_BYTES = 2_000_000
const MAX_CANDIDATES = 6
const DAY = 86400000

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MON = '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)'
const ORD = '(?:st|nd|rd|th)?'

const DUE_RE = /deadline|\bdue\b|\bclos(?:e|es|ed|ing)\b|submit|no later than|\buntil\b|\bby\b|\bends?\b/g
const OPEN_RE = /\bopen(?:s|ed|ing)?\b|\bavailable\b|\bbegins?\b|\blaunch(?:es)?\b|\bstarts?\b|\blive\b/g
const APP_RE = /appl|regist|admission|recommendation|\brec\b/

export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&ndash;|&mdash;|&#821[12];|&#x201[34];/gi, '–')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

function valid(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

// Last keyword match in `before`, or -1. "Nearest keyword wins."
function lastIndex(re: RegExp, s: string) {
  let idx = -1
  re.lastIndex = 0
  for (let m = re.exec(s); m; m = re.exec(s)) idx = m.index
  return idx
}

export type Candidate = { date: string; kind: 'open' | 'due' | 'unknown'; snippet: string; year_assumed: boolean }

export function findDates(text: string, now = new Date()): Candidate[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const min = today - 45 * DAY
  const max = today + 540 * DAY
  type Hit = { y: number | null; m: number; d: number; index: number; len: number }
  const hits: Hit[] = []
  const month = (s: string) => MONTHS.indexOf(s.slice(0, 3).toLowerCase()) + 1

  // "February 28, 2027" / "Feb 28" / "Feb. 28th"
  for (const m of text.matchAll(new RegExp(`\\b${MON}\\.?\\s+(\\d{1,2})${ORD}(?!\\d)(?:,?\\s+(20\\d{2}))?`, 'g')))
    hits.push({ y: m[3] ? +m[3] : null, m: month(m[1]), d: +m[2], index: m.index!, len: m[0].length })
  // "28 February 2027"
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})${ORD}\\s+${MON}\\.?,?\\s+(20\\d{2})\\b`, 'g')))
    hits.push({ y: +m[3], m: month(m[2]), d: +m[1], index: m.index!, len: m[0].length })
  // "2/28/2027" or "2/28/27"
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2}|\d{2})\b/g))
    hits.push({ y: m[3].length === 2 ? 2000 + +m[3] : +m[3], m: +m[1], d: +m[2], index: m.index!, len: m[0].length })
  // "2027-02-28"
  for (const m of text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g))
    hits.push({ y: +m[1], m: +m[2], d: +m[3], index: m.index!, len: m[0].length })

  const best = new Map<string, Candidate & { score: number }>()
  for (const h of hits) {
    let y = h.y
    const assumed = y === null
    if (y === null) {
      // No year on the page: take the next time this date comes around.
      y = now.getUTCFullYear()
      if (Date.UTC(y, h.m - 1, h.d) < today - 30 * DAY) y += 1
    }
    if (!valid(y, h.m, h.d)) continue
    const t = Date.UTC(y, h.m - 1, h.d)
    if (t < min || t > max) continue

    // Only look at the sentence the date sits in, so a deadline mentioned in
    // the previous sentence does not get attached to this date.
    let rawBefore = text.slice(Math.max(0, h.index - 110), h.index)
    const cut = Math.max(...[...rawBefore.matchAll(/[.!?]\s+(?=[A-Z])/g)].map(m => m.index! + m[0].length), 0)
    rawBefore = rawBefore.slice(cut)
    const before = rawBefore.toLowerCase()
    const after = text.slice(h.index + h.len, h.index + h.len + 50).split(/[.!?]\s+(?=[A-Z])/)[0].toLowerCase()
    const dueAt = lastIndex(DUE_RE, before)
    const openAt = lastIndex(OPEN_RE, before)
    let kind: Candidate['kind'] = 'unknown'
    if (dueAt >= 0 || openAt >= 0) kind = dueAt > openAt ? 'due' : 'open'
    else if (/deadline|\bdue\b/.test(after)) kind = 'due'

    const aboutApplying = APP_RE.test(before) || APP_RE.test(after)
    const score = (kind !== 'unknown' ? 2 : 0) + (aboutApplying ? 2 : 0) + (assumed ? 0 : 1)
    const snippet = text.slice(Math.max(0, h.index - 80), h.index + h.len + 50).trim()
    const date = iso(y, h.m, h.d)
    const key = `${date}|${kind}`
    const prev = best.get(key)
    if (!prev || score > prev.score) best.set(key, { date, kind, snippet, year_assumed: assumed, score })
  }

  let list = [...best.values()]
  // If anything looks like an application date, drop bare dates with no
  // context (usually the program's own session dates).
  if (list.some(c => c.score >= 3)) list = list.filter(c => c.score >= 2)
  list.sort((a, b) => b.score - a.score || a.date.localeCompare(b.date))
  return list.slice(0, MAX_CANDIDATES)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ score: _s, ...c }) => c)
}

async function checkOne(p: { id: string; url: string | null }) {
  if (!p.url) return { id: p.id, ok: false, reason: 'No link saved' }
  if (!/^https?:\/\//i.test(p.url)) return { id: p.id, ok: false, reason: 'Link is not a web address' }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(p.url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!res.ok) return { id: p.id, ok: false, reason: `Site returned ${res.status}` }
    const type = res.headers.get('content-type') || ''
    if (/pdf/i.test(type) || /\.pdf(\?|$)/i.test(p.url)) return { id: p.id, ok: false, reason: 'Link is a PDF (not readable here)' }
    if (type && !/html|text/i.test(type)) return { id: p.id, ok: false, reason: `Not a web page (${type.split(';')[0]})` }
    const html = (await res.text()).slice(0, MAX_BYTES)
    const text = htmlToText(html)
    if (text.length < 300) return { id: p.id, ok: false, reason: 'Page has almost no readable text (it loads with JavaScript)' }
    return { id: p.id, ok: true, candidates: findDates(text) }
  } catch (err) {
    const msg = (err as Error)?.name === 'AbortError' ? 'Site timed out' : 'Could not reach site'
    return { id: p.id, ok: false, reason: msg }
  } finally {
    clearTimeout(timer)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ error: 'Not signed in' }, 401)

    const rest = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/rest/v1/summer_programs?select=id,url`,
      { headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY')!, Authorization: auth } },
    )
    if (!rest.ok) return json({ error: `Could not read programs (${rest.status})` }, 502)
    const programs: { id: string; url: string | null }[] = await rest.json()

    const results = await Promise.all(programs.map(checkOne))
    return json({ checked_at: new Date().toISOString(), results })
  } catch (err) {
    console.error('check-summer-programs failed:', err)
    return json({ error: (err as Error).message || 'Check failed' }, 500)
  }
})
