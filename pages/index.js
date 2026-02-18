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
      const [eventsRes, playlistsRes, usersRes] = await Promise.all([
        fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Events`, {
          headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` }
        }),
        fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Playlists`, {
          headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` }
        }),
        fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Users`, {
          headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` }
        })
      ])

      const eventsData = await eventsRes.json()
      const playlistsData = await playlistsRes.json()
      const usersData = await usersRes.json()

      const playlistIdToHandle = {}
      playlistsData.records.forEach(p => {
        playlistIdToHandle[p.id] = p.fields.Handle
      })

      const userIdToName = {}
      usersData.records.forEach(u => {
        userIdToName[u.id] = u.fields['User Name']
      })

      const transformedEvents = eventsData.records.map(record => ({
        id: record.id,
        title: record.fields.Event,
        date: record.fields.When,
        link: record.fields.Link,
        playlist: record.fields.Playlist?.map(id => playlistIdToHandle[id]) || [],
        verificationStatus: record.fields.Playlist_Verification_Status
      }))

      const transformedPlaylists = playlistsData.records.map(record => ({
        id: record.id,
        handle: record.fields.Handle,
        name: record.fields['Playlist Name'],
        verificationStatus: record.fields.Playlist_Verification_Status
      }))

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="text-2xl font-bold text-gray-900">LOCOL</div>
            <div className="flex gap-8 items-center">
              <a href="/" className="text-gray-700 hover:text-gray-900 font-medium">What's on?</a>
              <a href="/dashboard" className="text-gray-700 hover:text-gray-900 font-medium">Dashboard</a>
            </div>
          </div>
        </div>
      </nav>

      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">What's on?</h1>
          <p className="text-lg text-gray-600">find & remix juicy events</p>
        </div>
      </div>

      {/* Search */}
      <div className="bg-gray-50 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <input
            type="text"
            placeholder="Search events..."
            className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Playlist Filters */}
      <div className="bg-gray-50 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <label className="text-sm font-medium text-gray-700 block mb-3">Filter by playlist:</label>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => toggleFilter('all')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                activeFilters.has('all')
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:border-gray-400'
              }`}
            >
              All events
            </button>
            {playlists.map(playlist => (
              <button
                key={playlist.id}
                onClick={() => toggleFilter(playlist.handle)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                  activeFilters.has(playlist.handle)
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:border-gray-400'
                }`}
              >
                {playlist.handle}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Events Grid */}
      <div className="bg-gray-50 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-sm text-gray-600 mb-6">{filteredEvents.length} events</p>
          
          {loading ? (
            <div className="text-center py-12 text-gray-600">Loading...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredEvents.map(event => (
                <div key={event.id} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3 leading-snug">{event.title}</h3>
                  <div className="flex flex-col gap-2 mb-4">
                    <span className="text-sm text-gray-600">{formatDate(event.date)}</span>
                    <span className="inline-block w-fit px-3 py-1 bg-blue-50 text-blue-700 rounded-md text-sm font-medium">
                      {event.playlist[0]}
                    </span>
                  </div>
                  {event.link && (
                    <a 
                      href={event.link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 text-sm font-medium hover:text-blue-700 hover:underline"
                    >
                      More info →
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}