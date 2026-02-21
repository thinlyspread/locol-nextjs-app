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

      const [eventsRecords, playlistsRecords] = await Promise.all([
        fetchAllRecords('Events'),
        fetchAllRecords('Playlists')
      ])

      console.log('Playlists fetched:', playlistsRecords.length, playlistsRecords)

      const playlistIdToHandle = {}
      playlistsRecords.forEach(p => {
        playlistIdToHandle[p.id] = p.fields.Handle
      })

      const transformedEvents = eventsRecords.map(record => {
        const playlistIds = Array.isArray(record.fields.Playlist)
          ? record.fields.Playlist
          : (record.fields.Playlist ? [record.fields.Playlist] : [])

        return {
          id: record.id,
          title: record.fields.Event,
          date: record.fields.When,
          link: record.fields.Link,
          links: record.fields.Links ? JSON.parse(record.fields.Links) : [],
          playlist: playlistIds.map(id => playlistIdToHandle[id]).filter(Boolean)
        }
      })

      const transformedPlaylists = playlistsRecords.map(record => ({
        id: record.id,
        handle: record.fields.Handle,
        name: record.fields['Playlist Name']
      }))

      setEvents(transformedEvents)
      setPlaylists(transformedPlaylists)
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

    // Hide events more than 2 weeks away
    const twoWeeksFromNow = new Date()
    twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14)
    twoWeeksFromNow.setHours(23, 59, 59, 999)
    const isNotTooFar = eventDate <= twoWeeksFromNow

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
    
    return matchesPlaylist && matchesSearch && matchesDate && isNotTooOld && isNotTooFar
  })
    .sort((a, b) => new Date(a.date) - new Date(b.date))

  function formatDate(dateString) {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase()
  }

  function getDomainFromUrl(url) {
    if (!url) return null
    try {
      const domain = new URL(url).hostname.replace('www.', '')
      return domain
    } catch {
      return null
    }
  }

  function getDomainPlaylist(url, allPlaylists) {
    const domain = getDomainFromUrl(url)
    if (!domain) return null

    // Map common domains to playlist handles
    const domainMap = {
      'universe.com': '@Universe',
      'ticketmaster.co.uk': '@Ticketmaster',
      'skiddle.com': '@Skiddle',
      'brightondome.org': '@BrightonDome',
      'wtm.uk': '@WTM',
      'brightonfestival.org': '@BrightonFestival'
    }

    const playlistHandle = domainMap[domain]

    // Check if this playlist actually exists
    return allPlaylists.find(p => p.handle === playlistHandle) ? playlistHandle : null
  }

  return (
    <>
      <Head>
        <title>LOCOL - What's on?</title>
      </Head>

      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div>
              <div className="text-2xl font-bold text-gray-900">LOCOL</div>
              <p className="text-xs text-gray-500">find, create & remix local events</p>
            </div>
            <div className="flex gap-8 items-center">
              <a href="/" className="text-gray-700 hover:text-gray-900 font-medium">What's on?</a>
              <a href="/dashboard" className="text-gray-700 hover:text-gray-900 font-medium">Dashboard</a>
            </div>
          </div>
        </div>
      </nav>


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
<div className="max-w-3xl mx-auto space-y-2">
                {filteredEvents.slice(0, displayCount).map((event) => (
                  <div
                    key={event.id}
                    className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition"
                  >
                    <h3 className="text-lg font-bold text-gray-900 mb-2">{event.title}</h3>

                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                      <span>{formatDate(event.date)}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      {(() => {
                        // Extract unique domains from actual event links (deduplicated)
                        const uniqueDomains = Array.from(
                          new Set(event.links.map(link => getDomainFromUrl(link.url)))
                        ).filter(Boolean).map(domain => {
                          // Find the first link for this domain
                          const linkEntry = event.links.find(l => getDomainFromUrl(l.url) === domain)
                          const playlistExists = playlists.find(p => p.handle === linkEntry.playlist)

                          return {
                            domain,
                            url: linkEntry.url,
                            playlist: linkEntry.playlist,
                            playlistExists
                          }
                        })

                        // Fallback: if no Links array, use primary Link field
                        if (uniqueDomains.length === 0 && event.link) {
                          const domain = getDomainFromUrl(event.link)
                          if (domain) {
                            return (
                              <div className="flex items-center gap-1.5">
                                <span className="text-orange-500 text-xs" title="Unverified source">!</span>
                                <a
                                  href={event.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium group"
                                >
                                  <span>{domain}</span>
                                  <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </a>
                              </div>
                            )
                          }
                        }

                        return uniqueDomains.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-1.5">
                            {idx > 0 && <span className="text-gray-400">•</span>}

                            {/* Verification icon */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                if (item.playlistExists) {
                                  toggleFilter(item.playlist)
                                }
                              }}
                              className={`text-xs ${item.playlistExists ? 'text-green-600' : 'text-orange-500'}`}
                              title={item.playlistExists ? 'Verified source' : 'Unverified source'}
                            >
                              {item.playlistExists ? '✓' : '!'}
                            </button>

                            {/* Event link domain */}
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium group"
                            >
                              <span>{item.domain}</span>
                              <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </a>
                          </div>
                        ))
                      })()}
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