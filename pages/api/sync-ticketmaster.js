export default async function handler(req, res) {
  const TICKETMASTER_KEY = process.env.NEXT_PUBLIC_TICKETMASTER_KEY
  const AIRTABLE_API_KEY = process.env.NEXT_PUBLIC_AIRTABLE_API_KEY
  const AIRTABLE_BASE_ID = process.env.NEXT_PUBLIC_AIRTABLE_BASE_ID

  // Fetch existing events for these playlists
  async function getExistingEvents(playlistIds) {
    const filter = `OR(${playlistIds.map(id => `FIND('${id}', ARRAYJOIN(Playlist))`).join(',')})`
    const response = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Events?filterByFormula=${encodeURIComponent(filter)}`,
      { headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` } }
    )
    const data = await response.json()
    return new Set(data.records.map(r => `${r.fields.Event}|${r.fields.When}`))
  }

  try {
    // 1. Fetch events from Ticketmaster (Brighton & Worthing)
    const [brightonRes, worthingRes] = await Promise.all([
      fetch(`https://app.ticketmaster.com/discovery/v2/events.json?apikey=${TICKETMASTER_KEY}&city=Brighton&countryCode=GB&size=20`),
      fetch(`https://app.ticketmaster.com/discovery/v2/events.json?apikey=${TICKETMASTER_KEY}&city=Worthing&countryCode=GB&size=20`)
    ])

    const brightonData = await brightonRes.json()
    const worthingData = await worthingRes.json()

    // 2. Get playlist IDs from Airtable
    const playlistsRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Playlists?filterByFormula=OR({Handle}='@TicketmasterBrighton',{Handle}='@TicketmasterWorthing')`,
      { headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` } }
    )
    const playlistsData = await playlistsRes.json()
    
    const brightonPlaylist = playlistsData.records.find(p => p.fields.Handle === '@TicketmasterBrighton')
    const worthingPlaylist = playlistsData.records.find(p => p.fields.Handle === '@TicketmasterWorthing')

    if (!brightonPlaylist || !worthingPlaylist) {
      return res.status(400).json({ 
        error: 'Playlists not found. Create @TicketmasterBrighton and @TicketmasterWorthing in Airtable first.' 
      })
    }

    // 3. Transform Ticketmaster events to Airtable format
    const brightonEvents = (brightonData._embedded?.events || []).slice(0, 10).map(e => ({
      fields: {
        'Event': e.name,
        'When': e.dates.start.localDate,
        'Link': e.url,
        'Playlist': [brightonPlaylist.id]
      }
    }))

    const worthingEvents = (worthingData._embedded?.events || []).slice(0, 10).map(e => ({
      fields: {
        'Event': e.name,
        'When': e.dates.start.localDate,
        'Link': e.url,
        'Playlist': [worthingPlaylist.id]
      }
    }))

    // 4. Create events in Airtable (batch create - max 10 per request)
    const allEvents = [...brightonEvents, ...worthingEvents]
    
    if (allEvents.length === 0) {
      return res.json({ success: true, message: 'No new events found', synced: 0 })
    }

    // Split into batches of 10
    const batch1 = allEvents.slice(0, 10)
    const batch2 = allEvents.slice(10, 20)
    
    let totalCreated = 0

    // Create first batch
    if (batch1.length > 0) {
      const createRes1 = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Events`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ records: batch1 })
        }
      )
      const createData1 = await createRes1.json()
      totalCreated += createData1.records?.length || 0
    }

    // Create second batch if exists
    if (batch2.length > 0) {
      const createRes2 = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Events`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ records: batch2 })
        }
      )
      const createData2 = await createRes2.json()
      totalCreated += createData2.records?.length || 0
    }

    res.json({ 
      success: true,
      synced: allEvents.length,
      brighton: brightonEvents.length,
      worthing: worthingEvents.length,
      created: totalCreated
    })

  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}