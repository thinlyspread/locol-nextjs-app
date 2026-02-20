const SOURCE_TRANSFORMS = {
  'brighton-dome': (raw) => ({
    Event: `${raw.Title} - ${raw.Subtitle}`,
    When: raw.Date,
    Link: raw.URL,
    Source: 'Brighton Dome',
    Playlist: '@BrightonDome'  // Add playlist
  })
}

export default async function handler(req, res) {
  const AIRTABLE_API_KEY = process.env.NEXT_PUBLIC_AIRTABLE_API_KEY
  const AIRTABLE_BASE_ID = process.env.NEXT_PUBLIC_AIRTABLE_BASE_ID

  const { source, data } = req.body

  console.log('Webhook received from:', source)

  const transform = SOURCE_TRANSFORMS[source]
  if (!transform) {
    return res.status(400).json({ error: 'Unknown source' })
  }

  const standardized = transform(data)
  console.log('Transformed to:', standardized)

  // Check for duplicates in Staging
  const filter = `Source='${standardized.Source}'`
  const stagingRes = await fetch(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Staging?filterByFormula=${encodeURIComponent(filter)}`,
    { headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` } }
  )
  const stagingData = await stagingRes.json()
  const existingEvents = new Set(stagingData.records.map(r => `${r.fields.Event}|${r.fields.When}`))

  const key = `${standardized.Event}|${standardized.When}`
  const isDuplicate = existingEvents.has(key)

  console.log('Duplicate check:', isDuplicate ? 'DUPLICATE FOUND' : 'New event')

  if (isDuplicate) {
    console.log('Skipping duplicate')
    return res.json({ success: true, skipped: true, reason: 'duplicate' })
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
          Source: standardized.Source,
          Playlist: standardized.Playlist,
          Status: 'Approved'
        }
      }]
    })
  })

  const insertData = await insertRes.json()
  console.log('Airtable response:', insertRes.status, insertData)
  console.log('Inserted to Staging:', insertData.records?.[0]?.id || 'FAILED')

  res.json({ success: true, inserted: true, recordId: insertData.records?.[0]?.id })
}
