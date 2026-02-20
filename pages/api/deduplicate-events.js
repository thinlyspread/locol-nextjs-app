export default async function handler(req, res) {
  const AIRTABLE_API_KEY = process.env.NEXT_PUBLIC_AIRTABLE_API_KEY
  const AIRTABLE_BASE_ID = process.env.NEXT_PUBLIC_AIRTABLE_BASE_ID

  try {
    // Fetch all events
    const response = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Events`,
      { headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` } }
    )
    const data = await response.json()

    // Track unique events by Event+When key
    const seen = new Map()
    const duplicates = []

    data.records.forEach(record => {
      const key = `${record.fields.Event}|${record.fields.When}`

      if (seen.has(key)) {
        // This is a duplicate - mark for deletion
        duplicates.push(record.id)
        console.log('DUPLICATE:', key, '- ID:', record.id)
      } else {
        // First occurrence - keep it
        seen.set(key, record.id)
      }
    })

    // Delete duplicates in batches of 10
    let deleted = 0
    for (let i = 0; i < duplicates.length; i += 10) {
      const batch = duplicates.slice(i, i + 10)

      // Delete using query params (Airtable batch delete)
      const deleteUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Events?${batch.map(id => `records[]=${id}`).join('&')}`
      await fetch(deleteUrl, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` }
      })

      console.log('Deleted batch:', batch)
      deleted += batch.length
    }

    res.json({
      success: true,
      total: data.records.length,
      unique: seen.size,
      duplicates: duplicates.length,
      deleted
    })

  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
