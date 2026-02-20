export default async function handler(req, res) {
  const AIRTABLE_API_KEY = process.env.NEXT_PUBLIC_AIRTABLE_API_KEY
  const AIRTABLE_BASE_ID = process.env.NEXT_PUBLIC_AIRTABLE_BASE_ID
  const SKIDDLE_KEY = process.env.NEXT_PUBLIC_SKIDDLE_KEY

  try {
    // Fetch existing events to avoid duplicates
    async function getExistingEvents(playlistHandles) {
      const filter = `OR(${playlistHandles.map(h => `FIND('${h}', ARRAYJOIN(Playlist))`).join(',')})`
      const response = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Events?filterByFormula=${encodeURIComponent(filter)}`,
        { headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` } }
      )
      const data = await response.json()
      return new Set(data.records.map(r => `${r.fields.Event}|${r.fields.When}`))
    }

    // Get Brighton & Worthing playlists
    const playlistsRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Playlists?filterByFormula=OR(Handle='@SkiddleBrighton', Handle='@SkiddleWorthing')`,
      { headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` } }
    )
    const playlistsData = await playlistsRes.json()
    const brightonPlaylist = playlistsData.records.find(r => r.fields.Handle === '@SkiddleBrighton')
    const worthingPlaylist = playlistsData.records.find(r => r.fields.Handle === '@SkiddleWorthing')

    if (!brightonPlaylist || !worthingPlaylist) {
      return res.status(400).json({ error: 'Playlists not found' })
    }

    // Get existing events
    const existingEvents = await getExistingEvents(['@SkiddleBrighton', '@SkiddleWorthing'])

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
      ...(brightonData.results || []).map(e => ({ ...e, playlist: brightonPlaylist.id })),
      ...(worthingData.results || []).map(e => ({ ...e, playlist: worthingPlaylist.id }))
    ]

    // Filter out duplicates
    const newEvents = allEvents.filter(event => {
      const key = `${event.eventname}|${event.date}`
      return !existingEvents.has(key)
    })

    // Create records for new events only
    const records = newEvents.map(event => ({
      fields: {
        'Event': event.eventname,
        'When': event.date,
        'Link': event.link,
        'Playlist': [event.playlist]
      }
    }))

    // Batch upload (max 10 at a time)
    let synced = 0
    for (let i = 0; i < records.length; i += 10) {
      const batch = records.slice(i, i + 10)
      await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Events`, {
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
