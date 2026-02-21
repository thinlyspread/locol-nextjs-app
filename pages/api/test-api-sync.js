/**
 * TEST ENDPOINT - Simulates API sync with fake test events
 * This inserts test events to Staging as if they came from Ticketmaster/Skiddle APIs
 */
export default async function handler(req, res) {
  const AIRTABLE_API_KEY = process.env.NEXT_PUBLIC_AIRTABLE_API_KEY
  const AIRTABLE_BASE_ID = process.env.NEXT_PUBLIC_AIRTABLE_BASE_ID

  try {
    // Fake Ticketmaster event
    const ticketmasterEvent = {
      fields: {
        'Event': 'Test Concert Night (Music) @ Brighton Dome',
        'When': '2026-02-28',
        'Link': 'https://ticketmaster.co.uk/test-concert',
        'Links': JSON.stringify([{ playlist: '@Ticketmaster', url: 'https://ticketmaster.co.uk/test-concert' }]),
        'Playlist': '@Ticketmaster',
        'Source': 'Ticketmaster',
        'Status': 'Approved'
      }
    }

    // Fake Skiddle event (returns Universe link!)
    const skiddleEvent = {
      fields: {
        'Event': 'Test Concert Night (Music) @ Brighton Dome',
        'When': '2026-02-28',
        'Link': 'https://universe.com/skiddle-test',
        'Links': JSON.stringify([{ playlist: '@Skiddle', url: 'https://universe.com/skiddle-test' }]),
        'Playlist': '@Skiddle',
        'Source': 'Skiddle',
        'Status': 'Approved'
      }
    }

    // Insert both to Staging
    const insertRes = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Staging`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        records: [ticketmasterEvent, skiddleEvent]
      })
    })

    const insertData = await insertRes.json()

    res.json({
      success: true,
      inserted: 2,
      message: 'Test API events inserted to Staging',
      records: insertData.records?.map(r => r.id)
    })

  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
