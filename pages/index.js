import { useState, useEffect } from 'react'
import Head from 'next/head'

export default function Home() {
  const [events, setEvents] = useState([])
  const [playlists, setPlaylists] = useState([])
  const [activeFilters, setActiveFilters] = useState(new Set(['#today', '#tomorrow']))
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [displayCount, setDisplayCount] = useState(50)

  const AIRTABLE_API_KEY = process.env.NEXT_PUBLIC_AIRTABLE_API_KEY
  const AIRTABLE_BASE_ID = process.env.NEXT_PUBLIC_AIRTABLE_BASE_ID

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      async function fetchAllRecords(tableName) {
        let allRecords = []
        let offset = null
        
        do {
          const url = offset 
            ? `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableName}?offset=${offset}`
            : `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableName}`
          
          const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` }
          })
          
          const data = await response.json()
          allRecords = allRecords.concat(data.records)
          offset = data.offset
        } while (offset)
        
        return allRecords
      }

      const [eventsRecords, playlistsRecords, usersRecords] = await Promise.all([
        fetchAllRecords('Events'),
        fetchAllRecords('Playlists'),
        fetchAllRecords('Users')
      ])

      const playlistIdToHandle = {}
      playlistsRecords.forEach(p => {
        playlistIdToHandle[p.id] = p.fields.Handle
      })

      const userIdToName = {}
      usersRecords.forEach(u => {
        userIdToName[u.id] = u.fields['User Name']
      })

      const transformedEvents = eventsRecords.map(record => ({
        id: record.id,
        title: record.fields.Event,
        date: record.fields.When,
        link: record.fields.Link,
        playlist: record.fields.Playlist?.map(id => playlistIdToHandle[id]) || [],
        verificationStatus: record.fields.Playlist_Verification_Status
      }))

      const transformedPlaylists = playlistsRecords.map(record => ({
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

  function toggleFilter(filter) {
    const newFilters = new Set(activeFilters)
    
    if (filter === 'all') {
      setActiveFilters(new Set(['all']))
    } else {
      newFilters.delete('all')
      if (newFilters.has(filter)) {
        newFilters.delete(filter)
      } else {
        newFilters.add(filter)
      }
      if (newFilters.size === 0) {
        setActiveFilters(new Set(['all']))
      } else {
        setActiveFilters(newFilters)
      }
    }
  }

	const filteredEvents = events
    	.filter(event => {    const matchesSearch = !searchTerm || 
      event.title.toLowerCase().includes(searchTerm.toLowerCase())
			
// Hide events older than yesterday
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(0, 0, 0, 0)
    const eventDate = new Date(event.date + 'T00:00:00')
    const isNotTooOld = eventDate >= yesterday
    
    let matchesDate = true
    const hasDateFilter = activeFilters.has('#today') || activeFilters.has('#tomorrow')
    
    if (hasDateFilter) {
      const eventDate = new Date(event.date + 'T00:00:00')
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)
      
      const eventTime = eventDate.getTime()
      const todayTime = today.getTime()
      const tomorrowTime = tomorrow.getTime()
      
      if (activeFilters.has('#today') && activeFilters.has('#tomorrow')) {
        matchesDate = eventTime === todayTime || eventTime === tomorrowTime
      } else if (activeFilters.has('#today')) {
        matchesDate = eventTime === todayTime
      } else if (activeFilters.has('#tomorrow')) {
        matchesDate = eventTime === tomorrowTime
      }
    }
    
    let matchesPlaylist = true
    if (!hasDateFilter) {
      matchesPlaylist = activeFilters.has('all') || 
        event.playlist.some(p => activeFilters.has(p))
    } else {
      const playlistFilters = Array.from(activeFilters).filter(f => f.startsWith('@'))
      if (playlistFilters.length > 0) {
        matchesPlaylist = event.playlist.some(p => activeFilters.has(p))
      }
    }
    
    return matchesPlaylist && matchesSearch && matchesDate && isNotTooOld
  })
    .sort((a, b) => new Date(a.date) - new Date(b.date))

  function formatDate(dateString) {
      const date = new Date(dateString)
      return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase()
    }

  return (
    <>
      <Head>
        <title>LOCOL - What's on?</title>
      </Head>

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

      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">What's on?</h1>
          <p className="text-lg text-gray-600">find & remix juicy events</p>
        </div>
      </div>

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

			{/* Filters - COMPACT */}
			      <div className="bg-gray-50 border-b border-gray-200">
			        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
			          <label className="text-sm font-medium text-gray-700 block mb-2">Filter:</label>
          
			          {/* Date filters - always visible */}
			          <div className="flex flex-wrap gap-2 mb-3">
			            <button
			              onClick={() => toggleFilter('all')}
			              className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
			                activeFilters.has('all')
			                  ? 'bg-blue-600 text-white'
			                  : 'bg-white text-gray-700 border border-gray-300 hover:border-gray-400'
			              }`}
			            >
			              All events
			            </button>

			            <button
			              onClick={() => toggleFilter('#today')}
			              className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
			                activeFilters.has('#today')
			                  ? 'bg-green-600 text-white border-green-600'
			                  : 'bg-white text-green-700 border border-green-600 hover:bg-green-50'
			              }`}
			            >
			              #Today
			            </button>

			            <button
			              onClick={() => toggleFilter('#tomorrow')}
			              className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
			                activeFilters.has('#tomorrow')
			                  ? 'bg-green-600 text-white border-green-600'
			                  : 'bg-white text-green-700 border border-green-600 hover:bg-green-50'
			              }`}
			            >
			              #Tomorrow
			            </button>
			          </div>

			          {/* Playlist filters - horizontal scroll */}
			          <div className="overflow-x-auto pb-2">
			            <div className="flex gap-2 min-w-max">
			              {playlists.map(playlist => (
			                <button
			                  key={playlist.id}
			                  onClick={() => toggleFilter(playlist.handle)}
			                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition whitespace-nowrap ${
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
			      </div>

  <div className="bg-gray-50 min-h-screen">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <p className="text-sm text-gray-600 mb-6">{filteredEvents.length} events</p>
          
            {loading ? (
              <div className="text-center py-12 text-gray-600">Loading...</div>
            ) : (
              <>
<div className="max-w-3xl mx-auto space-y-3">
                {filteredEvents.slice(0, displayCount).map((event) => (
                  <div
                    key={event.id}
                    className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition cursor-pointer"
                  >
                    <h3 className="text-xl font-bold text-gray-900 mb-3">{event.title}</h3>

                    <div className="flex items-center gap-3 text-sm text-gray-600 mb-3">
                      <span>{formatDate(event.date)}</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {event.playlist.slice(0, 3).map((handle, idx) => (
                        <div key={idx} className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleFilter(handle)
                            }}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            {handle}
                          </button>
                          {event.link && (
                            <a
                              href={event.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-gray-500 hover:text-blue-600"
                            >
                              ↗
                            </a>
                          )}
                        </div>
                      ))}
                      {event.playlist.length > 3 && (
                        <span className="text-gray-500 text-sm">
                          +{event.playlist.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

                {/* Load More button */}
                {filteredEvents.length > displayCount && (
                  <div className="text-center mt-8">
                    <button
                      onClick={() => setDisplayCount(prev => prev + 50)}
                      className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium transition"
                    >
                      Load More ({filteredEvents.length - displayCount} remaining)
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </>
  )
}