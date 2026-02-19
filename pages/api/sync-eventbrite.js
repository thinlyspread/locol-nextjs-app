export default async function handler(req, res) {
  const EVENTBRITE_TOKEN = process.env.NEXT_PUBLIC_EVENTBRITE_TOKEN
  const AIRTABLE_API_KEY = process.env.NEXT_PUBLIC_AIRTABLE_API_KEY
  const AIRTABLE_BASE_ID = process.env.NEXT_PUBLIC_AIRTABLE_BASE_ID

  try {
  // 1. Search for public events near Brighton/Worthing
      const [brightonRes, worthingRes] = await Promise.all([
        fetch(
          'https://www.eventbriteapi.com/v3/destination/events/?q=Brighton&page_size=20',
          { headers: { 'Authorization': `Bearer ${EVENTBRITE_TOKEN}` } }
        ),
        fetch(
          'https://www.eventbriteapi.com/v3/destination/events/?q=Worthing&page_size=20',
          { headers: { 'Authorization': `Bearer ${EVENTBRITE_TOKEN}` } }
        )
      ])

    const brightonData = await brightonRes.json()
    const worthingData = await worthingRes.json()

    // Check for errors
    if (brightonData.error || worthingData.error) {
      return res.status(400).json({ 
        error: 'Eventbrite API error',
        brighton: brightonData.error_description,
        worthing: worthingData.error_description
      })
    }

    // 2. Get playlist IDs from Airtable
    const playlistsRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Playlists?filterByFormula=OR({Handle}='@EventbriteBrighton',{Handle}='@EventbriteWorthing')`,
      { headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` } }
    )
    const playlistsData = await playlistsRes.json()
    
    const brightonPlaylist = playlistsData.records.find(p => p.fields.Handle === '@EventbriteBrighton')
    const worthingPlaylist = playlistsData.records.find(p => p.fields.Handle === '@EventbriteWorthing')

    if (!brightonPlaylist || !worthingPlaylist) {
      return res.status(400).json({ 
        error: 'Playlists not found. Create @EventbriteBrighton and @EventbriteWorthing in Airtable first.' 
      })
    }

    // 3. Transform Eventbrite events to Airtable format
    const brightonEvents = (brightonData.events || []).slice(0, 10).map(e => ({
      fields: {
        'Event': e.name.text,
        'When': e.start.local.split('T')[0], // Extract date only
        'Link': e.url,
        'Playlist': [brightonPlaylist.id]
      }
    }))

    const worthingEvents = (worthingData.events || []).slice(0, 10).map(e => ({
      fields: {
        'Event': e.name.text,
        'When': e.start.local.split('T')[0],
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