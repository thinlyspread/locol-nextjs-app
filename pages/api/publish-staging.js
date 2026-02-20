export default async function handler(req, res) {
  const AIRTABLE_API_KEY = process.env.NEXT_PUBLIC_AIRTABLE_API_KEY
  const AIRTABLE_BASE_ID = process.env.NEXT_PUBLIC_AIRTABLE_BASE_ID

  try {
    // Get all Approved items from Staging with pagination
    let allRecords = []
    let offset = null

    do {
      const url = offset
        ? `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Staging?filterByFormula=AND(Status='Approved', {Published Event ID}=BLANK())&offset=${offset}`
        : `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Staging?filterByFormula=AND(Status='Approved', {Published Event ID}=BLANK())`

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` }
      })
      const data = await response.json()
      allRecords = allRecords.concat(data.records)
      offset = data.offset
    } while (offset)

    if (allRecords.length === 0) {
      return res.json({ success: true, published: 0, message: 'No new events to publish' })
    }

    // Get all playlists to map handles to IDs
    const playlistsRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Playlists`,
      { headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` } }
    )
    const playlistsData = await playlistsRes.json()
    const playlistMap = {}
    playlistsData.records.forEach(p => {
      playlistMap[p.fields.Handle] = p.id
    })

    // Create records in Events table
    const eventsToCreate = allRecords.map(r => ({
      fields: {
        'Event': r.fields.Event,
        'When': r.fields.When,
        'Link': r.fields.Link,
        'Playlist': [playlistMap[r.fields.Playlist]]  // Convert handle to ID array
      }
    }))

    let published = 0
    const updates = []

    // Batch create in Events (max 10 at a time)
    for (let i = 0; i < eventsToCreate.length; i += 10) {
      const batch = eventsToCreate.slice(i, i + 10)
      const createRes = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Events`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ records: batch })
      })

      const createData = await createRes.json()
      console.log('Batch create response:', createRes.status, createData.error || `Created ${createData.records?.length}`)
      published += createData.records?.length || 0

      // Prepare updates for Staging (link to published event)
      createData.records?.forEach((newEvent, idx) => {
        const stagingRecord = allRecords[i + idx]
        updates.push({
          id: stagingRecord.id,
          fields: {
            'Status': 'Published',
            'Published Event ID': [newEvent.id]
          }
        })
      })
    }

    // Update Staging records to Published status (batch)
    for (let i = 0; i < updates.length; i += 10) {
      const batch = updates.slice(i, i + 10)
      await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Staging`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ records: batch })
      })
    }

    res.json({ success: true, published })

  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
