import { useState, useEffect } from 'react'
import Head from 'next/head'

export default function Home() {
  const [events, setEvents] = useState([])
  const [playlists, setPlaylists] = useState([])
  const [activeFilters, setActiveFilters] = useState(new Set(['all']))
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)

  const AIRTABLE_API_KEY = process.env.NEXT_PUBLIC_AIRTABLE_API_KEY
  const AIRTABLE_BASE_ID = process.env.NEXT_PUBLIC_AIRTABLE_BASE_ID

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      // Fetch Events
      const eventsRes = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Events`,
        { headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` } }
      )
      const eventsData = await eventsRes.json()

      // Fetch Playlists
      const playlistsRes = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Playlists`,
        { headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` } }
      )
      const playlistsData = await playlistsRes.json()

      // Fetch Users
      const usersRes = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Users`,
        { headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` } }
      )
      const usersData = await usersRes.json()

      // Map IDs to readable values
      const playlistIdToHandle = {}
      playlistsData.records.forEach(p => {
        playlistIdToHandle[p.id] = p.fields.Handle
      })

      const userIdToName = {}
      usersData.records.forEach(u => {
        userIdToName[u.id] = u.fields['User Name']
      })

      // Transform events
      const transformedEvents = eventsData.records.map(record => ({
        id: record.id,
        title: record.fields.Event,
        date: record.fields.When,
        link: record.fields.Link,
        playlist: record.fields.Playlist?.map(id => playlistIdToHandle[id]) || [],
        verificationStatus: record.fields.Playlist_Verification_Status
      }))

      // Transform playlists
      const transformedPlaylists = playlistsData.records.map(record => ({
        id: record.id,
        handle: record.fields.Handle,
        name: record.fields['Playlist Name'],
        verificationStatus: record.fields.Playlist_Verification_Status
      }))

      // Filter verified only
      const verifiedEvents = transformedEvents.filter(e => {
        const status = Array.isArray(e.verificationStatus) ? e.verificationStatus[0] : e.verificationStatus
        return status === 'Verified'
      })

      const verifiedPlaylists = transformedPlaylists.filter(p => {
        const status = Array.isArray(p.verificationStatus) ? p.verificationStatus[0] : p.verificationStatus
        return status === 'Verified'
      })

      setEvents(verifiedEvents)
      setPlaylists(verifiedPlaylists)
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  function toggleFilter(playlist) {
    const newFilters = new Set(activeFilters)
    
    if (playlist === 'all') {
      setActiveFilters(new Set(['all']))
    } else {
      newFilters.delete('all')
      if (newFilters.has(playlist)) {
        newFilters.delete(playlist)
      } else {
        newFilters.add(playlist)
      }
      if (newFilters.size === 0) {
        setActiveFilters(new Set(['all']))
      } else {
        setActiveFilters(newFilters)
      }
    }
  }

  const filteredEvents = events.filter(event => {
    const matchesPlaylist = activeFilters.has('all') || 
      event.playlist.some(p => activeFilters.has(p))
    
    const matchesSearch = !searchTerm || 
      event.title.toLowerCase().includes(searchTerm.toLowerCase())
    
    return matchesPlaylist && matchesSearch
  })

  function formatDate(dateString) {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  return (
    <>
      <Head>
        <title>LOCOL - What's on?</title>
      </Head>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="text-2xl font-bold">LOCOL</div>
          <div className="flex gap-8 items-center">
            <a href="/" className="text-gray-600 hover:text-gray-900">What's on?</a>
            <a href="/dashboard" className="text-gray-600 hover:text-gray-900">Dashboard</a>
            <button className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700">
              Add event
            </button>
          </div>
        </div>
      </nav>

      {/* Header */}
      <header className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold mb-2">What's on?</h1>
        <p className="text-gray-600">find & remix juicy events</p>
      </header>

      {/* Search */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <input
          type="text"
          placeholder="Search events..."
          className="w-full p-3 border border-gray-300 rounded-lg"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Playlist Filters */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <span className="text-sm text-gray-600 block mb-2">Filter by playlist:</span>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => toggleFilter('all')}
            className={`px-4 py-2 rounded-full border transition ${
              activeFilters.has('all')
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-gray-100 border-gray-300 hover:bg-gray-200'
            }`}
          >
            All events
          </button>
          {playlists.map(playlist => (
            <button
              key={playlist.id}
              onClick={() => toggleFilter(playlist.handle)}
              className={`px-4 py-2 rounded-full border transition ${
                activeFilters.has(playlist.handle)
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-gray-100 border-gray-300 hover:bg-gray-200'
              }`}
            >
              {playlist.handle}
            </button>
          ))}
        </div>
      </div>

      {/* Events Grid */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <p className="text-gray-600 mb-4">{filteredEvents.length} events</p>
        
        {loading ? (
          <div className="text-center py-12">Loading...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEvents.map(event => (
              <div key={event.id} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition">
                <h3 className="text-lg font-semibold mb-3">{event.title}</h3>
                <div className="flex flex-col gap-2 mb-4">
                  <span className="text-sm text-gray-600">{formatDate(event.date)}</span>
                  <span className="inline-block w-fit px-3 py-1 bg-gray-100 rounded text-sm text-blue-600">
                    {event.playlist[0]}
                  </span>
                </div>
                {event.link && (
                  <a 
                    href={event.link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 text-sm hover:underline"
                  >
                    More info →
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}