export default async function handler(req, res) {
  try {
    // Test public endpoint - search for events near Brighton
    // Using their documented API format
    const response = await fetch(
      'https://api.songkick.com/api/3.0/events.json?apikey=YOUR_API_KEY&location=geo:50.8225,-0.1372&per_page=10'
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