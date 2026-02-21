export default async function handler(req, res) {
  const AIRTABLE_API_KEY = process.env.NEXT_PUBLIC_AIRTABLE_API_KEY
  const AIRTABLE_BASE_ID = process.env.NEXT_PUBLIC_AIRTABLE_BASE_ID

  try {
    const { event, task } = req.body

    console.log('RAW webhook:', JSON.stringify(req.body, null, 2))

    // Extract captured list data (Browse AI structure)
    const capturedLists = task?.capturedLists || {}
    const listName = Object.keys(capturedLists)[0] // Get first list
    const listData = capturedLists[listName] || [] // Get array of items

    console.log(`Processing ${listData.length} events from list: ${listName}`)

    // Get existing events from Staging for duplicate detection
    const stagingRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Staging`,
      { headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` } }
    )
    const stagingData = await stagingRes.json()
    const existingEvents = new Set(stagingData.records.map(r => `${r.fields.Event}|${r.fields.When}|${r.fields.Source}`))

    let inserted = 0
    let skipped = 0

    // Process each item in the list
    for (const rawItem of listData) {
      const standardized = transformScrapedData(rawItem)
      const key = `${standardized.Event}|${standardized.When}|${standardized.Source}`

      // Skip duplicates
      if (existingEvents.has(key)) {
        console.log('Duplicate found, skipping:', key)
        skipped++
        continue
      }

      // Insert to Staging
      const insertRes = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Staging`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          records: [{
            fields: {
              Event: standardized.Event,
              When: standardized.When,
              Link: standardized.Link,
              Links: JSON.stringify(standardized.Links),
              Playlist: standardized.Playlist,
              Source: standardized.Source,
              Status: 'Approved'
            }
          }]
        })
      })

      const insertData = await insertRes.json()

      if (insertData.records?.[0]?.id) {
        console.log('Inserted:', standardized.Event, '→', insertData.records[0].id)
        inserted++
        existingEvents.add(key) // Add to set to prevent duplicates within same batch
      } else {
        console.log('Failed to insert:', standardized.Event, insertData.error)
      }
    }

    res.json({ success: true, inserted, skipped, total: listData.length })

  } catch (error) {
    console.error('Webhook error:', error)
    res.status(500).json({ error: error.message })
  }
}

// Universal transform function
function transformScrapedData(raw) {
  // Build event name from available fields
  let eventParts = []
  if (raw.Title) eventParts.push(raw.Title)
  if (raw.Subtitle && raw.Subtitle !== raw.Title) eventParts.push(raw.Subtitle)
  if (raw.Category) eventParts.push(`(${raw.Category})`)
  if (raw.Venue) eventParts.push(`@ ${raw.Venue}`)

  const eventName = eventParts.filter(Boolean).join(' ') || 'Untitled Event'

  // Parse date (returns first date if range)
  const dates = parseDates(raw.Date || '')
  const parsedDate = dates[0] || new Date().toISOString().substring(0, 10)

  // Determine source and playlist from link domain
  const domain = getDomainFromUrl(raw.Link)
  const source = inferSource(domain)
  const playlist = inferPlaylist(domain)

  return {
    Event: eventName,
    When: parsedDate,
    Link: raw.Link,
    Links: [{ playlist, url: raw.Link }],
    Playlist: playlist,
    Source: source
  }
}

function getDomainFromUrl(url) {
  if (!url) return null
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return null
  }
}

function inferSource(domain) {
  const domainMap = {
    'brightondome.org': 'Brighton Dome',
    'brightonfestival.org': 'Brighton Festival',
    'wtm.uk': 'WTM',
    'universe.com': 'Universe'
  }
  return domainMap[domain] || domain || 'Unknown'
}

function inferPlaylist(domain) {
  const domainMap = {
    'brightondome.org': '@BrightonDome',
    'brightonfestival.org': '@BrightonFestival',
    'wtm.uk': '@WTM',
    'universe.com': '@Universe'
  }
  return domainMap[domain] || (domain ? `@${domain.split('.')[0]}` : '@Unknown')
}

// Date parsing functions
const MONTHS = {
  january:1, february:2, march:3, april:4,
  may:5, june:6, july:7, august:8,
  september:9, october:10, november:11, december:12,
  jan:1, feb:2, mar:3, apr:4,
  jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12
}

const CURRENT_YEAR = new Date().getFullYear()

function clean(str) {
  return str
    .replace(/\(.*?\)/g, '')
    .replace(/,?\s*\d+(\.\d+)?\s*(am|pm)/gi, '')
    .trim()
}

function stripDayName(str) {
  return str.replace(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\s+/i, '').trim()
}

function parseSingleDate(str, fallbackYear) {
  str = stripDayName(clean(str)).toLowerCase()
  const parts = str.split(/[\s,]+/).filter(Boolean)
  let day, month, year

  for (const p of parts) {
    if (/^\d{4}$/.test(p)) year = parseInt(p)
    else if (/^\d{1,2}$/.test(p) && !day) day = parseInt(p)
    else if (MONTHS[p]) month = MONTHS[p]
    else if (MONTHS[p.substring(0,3)]) month = MONTHS[p.substring(0,3)]
  }

  if (!year) year = fallbackYear || CURRENT_YEAR
  if (!day || !month) return null

  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}

function expandRange(startISO, endISO) {
  const dates = []
  const current = new Date(startISO + 'T12:00:00Z')
  const end = new Date(endISO + 'T12:00:00Z')

  while (current <= end) {
    dates.push(current.toISOString().substring(0, 10))
    current.setUTCDate(current.getUTCDate() + 1)
  }
  return dates
}

function parseDates(raw) {
  if (!raw) return []
  raw = clean(raw)

  if (!raw.includes(' - ')) {
    const d = parseSingleDate(raw)
    return d ? [d] : []
  }

  const dashIndex = raw.indexOf(' - ')
  const startRaw = raw.substring(0, dashIndex).trim()
  const endRaw = raw.substring(dashIndex + 3).trim()

  const endDate = parseSingleDate(endRaw)
  if (!endDate) return []

  const endYear = parseInt(endDate.substring(0, 4))
  const endMonth = parseInt(endDate.substring(5, 7))

  const startLower = startRaw.toLowerCase()
  const startHasMonth = Object.keys(MONTHS).some(m => startLower.includes(m))

  let startDate
  if (startHasMonth) {
    startDate = parseSingleDate(startRaw, endYear)
  } else {
    const dayMatch = startRaw.match(/\d+/)
    if (!dayMatch) return []
    const startDay = parseInt(dayMatch[0])
    startDate = `${endYear}-${String(endMonth).padStart(2,'0')}-${String(startDay).padStart(2,'0')}`
  }

  if (!startDate) return []
  return expandRange(startDate, endDate)
}
