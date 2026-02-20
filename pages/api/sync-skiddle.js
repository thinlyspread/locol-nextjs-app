export default async function handler(req, res) {
  const AIRTABLE_API_KEY = process.env.NEXT_PUBLIC_AIRTABLE_API_KEY
  const AIRTABLE_BASE_ID = process.env.NEXT_PUBLIC_AIRTABLE_BASE_ID
  const SKIDDLE_KEY = process.env.NEXT_PUBLIC_SKIDDLE_KEY

  try {
    // Fetch existing events from STAGING to avoid duplicates
    async function getExistingInStaging(source) {
      const filter = `Source='${source}'`
      const response = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Staging?filterByFormula=${encodeURIComponent(filter)}`,
        { headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` } }
      )
      const data = await response.json()
      return new Set(data.records.map(r => `${r.fields.Event}|${r.fields.When}`))
    }

    const existingEvents = await getExistingInStaging('Skiddle')

    // Fetch Brighton events
    const brightonRes = await fetch(
      `https://www.skiddle.com/api/v1/events/search/?api_key=${SKIDDLE_KEY}&keyword=Brighton&limit=50`
    )
    const brightonData = await brightonRes.json()

    // Fetch Worthing events
    const worthingRes = await fetch(
      `https://www.skiddle.com/api/v1/events/search/?api_key=${SKIDDLE_KEY}&keyword=Worthing&limit=50`
    )
    const worthingData = await worthingRes.json()

    const allEvents = [
      ...(brightonData.results || []),
      ...(worthingData.results || [])
    ]

    // Filter out duplicates
    const newEvents = allEvents.filter(event => {
      const key = `${event.eventname}|${event.date}`
      return !existingEvents.has(key)
    })

    // Create records for Staging - all link to single @Skiddle playlist
    const records = newEvents.map(event => ({
      fields: {
        'Event': event.eventname,
        'When': event.date,
        'Link': event.link,
        'Links': JSON.stringify([{ playlist: '@Skiddle', url: event.link }]),
        'Playlist': '@Skiddle',
        'Source': 'Skiddle',
        'Status': 'Approved'
      }
    }))

    // Batch upload to STAGING
    let synced = 0
    for (let i = 0; i < records.length; i += 10) {
      const batch = records.slice(i, i + 10)
      await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Staging`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ records: batch })
      })
      synced += batch.length
    }

    res.json({ success: true, synced, total: allEvents.length, skipped: allEvents.length - synced })

  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
