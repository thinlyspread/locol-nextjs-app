export default async function handler(req, res) {
  const AIRTABLE_API_KEY = process.env.NEXT_PUBLIC_AIRTABLE_API_KEY
  const AIRTABLE_BASE_ID = process.env.NEXT_PUBLIC_AIRTABLE_BASE_ID

  try {
    // Fetch all events with pagination
    let allRecords = []
    let offset = null

    do {
      const url = offset
        ? `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Events?offset=${offset}`
        : `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Events`

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` }
      })
      const data = await response.json()
      allRecords = allRecords.concat(data.records)
      offset = data.offset
    } while (offset)

    // Group by Event+When
    const groups = new Map()

    allRecords.forEach(record => {
      const key = `${record.fields.Event}|${record.fields.When}`

      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key).push(record)
    })

    // Find groups with duplicates
    const toMerge = Array.from(groups.values()).filter(g => g.length > 1)

    let merged = 0
    let deleted = 0

    for (const group of toMerge) {
      // Keep first record, merge playlists from others
      const [keeper, ...duplicates] = group

      // Collect all playlist IDs
      const allPlaylists = new Set(keeper.fields.Playlist || [])
      duplicates.forEach(dup => {
        (dup.fields.Playlist || []).forEach(p => allPlaylists.add(p))
      })

      // Update keeper with merged playlists
      await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Events/${keeper.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: { 'Playlist': Array.from(allPlaylists) }
        })
      })

      // Delete duplicates
      for (const dup of duplicates) {
        await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Events/${dup.id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` }
        })
        deleted++
      }

      merged++
      console.log(`Merged: ${keeper.fields.Event} - ${allPlaylists.size} playlists`)
    }

    res.json({
      success: true,
      total: allRecords.length,
      duplicateGroups: toMerge.length,
      eventsDeleted: deleted,
      eventsMerged: merged
    })

  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
