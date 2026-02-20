export default async function handler(req, res) {
  const SKIDDLE_KEY = process.env.NEXT_PUBLIC_SKIDDLE_KEY

  try {
    // Test Brighton events
    const response = await fetch(
      `https://www.skiddle.com/api/v1/events/search/?api_key=${SKIDDLE_KEY}&keyword=Brighton&limit=10`
    )

    const data = await response.json()

    res.json({
      success: response.ok,
      count: data.results?.length || 0,
      data
    })

  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
