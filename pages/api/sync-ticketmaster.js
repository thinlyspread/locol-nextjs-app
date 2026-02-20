export default async function handler(req, res) {
  const AIRTABLE_API_KEY = process.env.NEXT_PUBLIC_AIRTABLE_API_KEY
  const AIRTABLE_BASE_ID = process.env.NEXT_PUBLIC_AIRTABLE_BASE_ID
  const TICKETMASTER_KEY = process.env.NEXT_PUBLIC_TICKETMASTER_KEY

  try {
    // Fetch existing events from STAGING to avoid duplicates
    async function getExistingInStaging(sources) {
      const filter = `OR(${sources.map(s => `Source='${s}'`).join(',')})`
      const response = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Staging?filterByFormula=${encodeURIComponent(filter)}`,
        { headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` } }
      )
      const data = await response.json()
      return new Set(data.records.map(r => `${r.fields.Event}|${r.fields.When}`))
    }

    const sources = ['Ticketmaster Brighton', 'Ticketmaster Worthing']
    const existingEvents = await getExistingInStaging(sources)

    // Fetch Brighton events
    const brightonRes = await fetch(
      `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${TICKETMASTER_KEY}&city=Brighton&countryCode=GB&size=50`
    )
    const brightonData = await brightonRes.json()

    // Fetch Worthing events
    const worthingRes = await fetch(
      `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${TICKETMASTER_KEY}&city=Worthing&countryCode=GB&size=50`
    )
    const worthingData = await worthingRes.json()

    // Get playlists for linking
    const playlistsRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Playlists?filterByFormula=OR(Handle='@TicketmasterBrighton', Handle='@TicketmasterWorthing')`,
      { headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` } }
    )
    const playlistsData = await playlistsRes.json()
    const brightonPlaylist = playlistsData.records.find(r => r.fields.Handle === '@TicketmasterBrighton')
    const worthingPlaylist = playlistsData.records.find(r => r.fields.Handle === '@TicketmasterWorthing')

    const allEvents = [
      ...(brightonData._embedded?.events || []).map(e => ({
        ...e,
        source: 'Ticketmaster Brighton',
        playlist: brightonPlaylist?.fields.Handle
      })),
      ...(worthingData._embedded?.events || []).map(e => ({
        ...e,
        source: 'Ticketmaster Worthing',
        playlist: worthingPlaylist?.fields.Handle
      }))
    ]

    // Filter out duplicates
    const newEvents = allEvents.filter(event => {
      const key = `${event.name}|${event.dates.start.localDate}`
      return !existingEvents.has(key)
    })

    // Create records for Staging
    const records = newEvents.map(event => ({
      fields: {
        'Event': event.name,
        'When': event.dates.start.localDate,
        'Link': event.url,
        'Playlist': event.playlist,
        'Source': event.source,
        'Status': 'Approved'
      }
    }))

    // Debug: show first record being sent
    console.log('Sample record to upload:', JSON.stringify(records[0], null, 2))

    // Batch upload to STAGING
    let synced = 0
    for (let i = 0; i < records.length; i += 10) {
      const batch = records.slice(i, i + 10)
      const response = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Staging`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ records: batch })
      })

      const result = await response.json()
      console.log('Batch upload response:', response.status, result.error || 'success')

      synced += batch.length
    }

    res.json({ success: true, synced, total: allEvents.length, skipped: allEvents.length - synced })

  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
