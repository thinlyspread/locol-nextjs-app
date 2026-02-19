export default async function handler(req, res) {
  const EVENTBRITE_TOKEN = process.env.NEXT_PUBLIC_EVENTBRITE_TOKEN

  try {
    // Get events from your organization
    const response = await fetch(
      'https://www.eventbriteapi.com/v3/organizations/2992521092413/events/',
      {
        headers: {
          'Authorization': `Bearer ${EVENTBRITE_TOKEN}`
        }
      }
    )

    const data = await response.json()
    
    res.json({ 
      success: response.ok,
      status: response.status,
      data
    })

  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}