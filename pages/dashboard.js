import { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'

export default function Dashboard() {
  const router = useRouter()
  const [userPlaylists, setUserPlaylists] = useState([])
  const [userEvents, setUserEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingEvent, setEditingEvent] = useState(null)
  const [playlistFilters, setPlaylistFilters] = useState(new Set(['all']))
  const [displayCount, setDisplayCount] = useState(50)
  const [isAddingInline, setIsAddingInline] = useState(false)
  const [newEvent, setNewEvent] = useState({ event: '', when: '', link: '', playlist: '' })
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')

  const AIRTABLE_API_KEY = process.env.NEXT_PUBLIC_AIRTABLE_API_KEY
  const AIRTABLE_BASE_ID = process.env.NEXT_PUBLIC_AIRTABLE_BASE_ID
  const CURRENT_USER = 'Luc (me)'

  useEffect(() => {
    fetchUserData()
  }, [])

  async function fetchUserData() {
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
      const playlistIdToName = {}
      playlistsRecords.forEach(p => {
        playlistIdToHandle[p.id] = p.fields.Handle
        playlistIdToName[p.id] = p.fields['Playlist Name']
      })

      const userIdToName = {}
      usersRecords.forEach(u => {
        userIdToName[u.id] = u.fields['User Name']
      })

      const transformedPlaylists = playlistsRecords.map(record => ({
        id: record.id,
        handle: record.fields.Handle,
        name: record.fields['Playlist Name'],
        owner: record.fields['Playlist Owner']?.map(id => userIdToName[id]) || [],
        verificationStatus: record.fields.Playlist_Verification_Status,
        apiSyncEnabled: record.fields['Sync Enabled'] || false
      }))

      const transformedEvents = eventsRecords.map(record => ({
        id: record.id,
        title: record.fields.Event,
        date: record.fields.When,
        link: record.fields.Link,
        playlist: record.fields.Playlist?.map(id => playlistIdToHandle[id]) || [],
        playlistIds: record.fields.Playlist || [],
        playlistNames: record.fields.Playlist?.map(id => playlistIdToName[id]) || [],
        submittedBy: record.fields.Submitted_By?.map(id => userIdToName[id]) || [],
        verificationStatus: record.fields.Playlist_Verification_Status
      }))

      const myPlaylists = transformedPlaylists.filter(p => p.owner.includes(CURRENT_USER))
      const myEvents = transformedEvents.filter(e => e.submittedBy?.includes(CURRENT_USER))

      setUserPlaylists(myPlaylists)
      setUserEvents(myEvents)
    } catch (error) {
      console.error('Error fetching user data:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateEvent(e) {
    e.preventDefault()
    const formData = new FormData(e.target)
    
    const playlistHandle = formData.get('playlist')
    const playlist = userPlaylists.find(p => p.handle === playlistHandle)
    
    if (!playlist) {
      alert('Playlist not found')
      return
    }

    try {
      const response = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Events`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            records: [{
              fields: {
                'Event': formData.get('event'),
                'When': formData.get('when'),
                'Link': formData.get('link') || '',
                'Playlist': [playlist.id]
              }
            }]
          })
        }
      )

      if (!response.ok) throw new Error('Failed to save event')

      alert('Event saved successfully!')
      e.target.reset()
      setEditingEvent(null)
      fetchUserData()
    } catch (error) {
      console.error('Error saving event:', error)
      alert('Error saving event: ' + error.message)
    }
  }

  async function handleUpdateEvent(e) {
    e.preventDefault()
    const formData = new FormData(e.target)
    
    const playlistHandle = formData.get('playlist')
    const playlist = userPlaylists.find(p => p.handle === playlistHandle)
    
    if (!playlist) {
      alert('Playlist not found')
      return
    }

    try {
      const response = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Events/${editingEvent.id}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fields: {
              'Event': formData.get('event'),
              'When': formData.get('when'),
              'Link': formData.get('link') || '',
              'Playlist': [playlist.id]
            }
          })
        }
      )

      if (!response.ok) throw new Error('Failed to update event')

      alert('Event updated successfully!')
      setEditingEvent(null)
      fetchUserData()
    } catch (error) {
      console.error('Error updating event:', error)
      alert('Error updating event: ' + error.message)
    }
  }

  async function deleteEvent(eventId) {
    if (!confirm('Are you sure you want to delete this event?')) return

    try {
      const response = await fetch(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Events/${eventId}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` }
        }
      )

      if (!response.ok) throw new Error('Failed to delete event')

      alert('Event deleted successfully!')
      fetchUserData()
    } catch (error) {
      console.error('Error deleting event:', error)
      alert('Error deleting event: ' + error.message)
    }
  }

  function startEdit(event) {
    setEditingEvent(event)
    // TODO: Implement inline editing
    alert('Inline editing coming soon! For now, please delete and re-add the event.')
  }

  function cancelEdit() {
    setEditingEvent(null)
  }
  
  function togglePlaylistFilter(filter) {
      const newFilters = new Set(playlistFilters)
    
      if (filter === 'all') {
        setPlaylistFilters(new Set(['all']))
      } else {
        newFilters.delete('all')
        if (newFilters.has(filter)) {
          newFilters.delete(filter)
        } else {
          newFilters.add(filter)
        }
        if (newFilters.size === 0) {
          setPlaylistFilters(new Set(['all']))
        } else {
          setPlaylistFilters(newFilters)
        }
      }
    }

  async function syncAllAPIs() {
    setIsSyncing(true)
    setSyncMessage('')

    try {
      // Get all API-enabled playlists
      const apiPlaylists = userPlaylists.filter(p => p.apiSyncEnabled)

      if (apiPlaylists.length === 0) {
        setSyncMessage('⚠ No API playlists enabled for sync')
        return
      }

      let totalSynced = 0
      const results = []

      // Sync Ticketmaster if any Ticketmaster playlists are enabled
      const ticketmasterPlaylists = apiPlaylists.filter(p =>
        p.handle.toLowerCase().includes('ticketmaster')
      )

      if (ticketmasterPlaylists.length > 0) {
        const response = await fetch('/api/sync-ticketmaster')
        const data = await response.json()

        if (data.success) {
          totalSynced += data.synced || 0
          results.push(`Ticketmaster: ${data.synced}`)
        } else {
          results.push(`Ticketmaster: failed`)
        }
      }

      // Sync Skiddle if any Skiddle playlists are enabled
      const skiddlePlaylists = apiPlaylists.filter(p =>
        p.handle.toLowerCase().includes('skiddle')
      )

      if (skiddlePlaylists.length > 0) {
        const response = await fetch('/api/sync-skiddle')
        const data = await response.json()

        if (data.success) {
          totalSynced += data.synced || 0
          results.push(`Skiddle: ${data.synced}`)
        } else {
          results.push(`Skiddle: failed`)
        }
      }

      if (results.length > 0) {
        setSyncMessage(`✓ Synced ${totalSynced} events (${results.join(', ')})`)
        fetchUserData()
      }
    } catch (error) {
      setSyncMessage(`✗ Sync failed: ${error.message}`)
    } finally {
      setIsSyncing(false)
      setTimeout(() => setSyncMessage(''), 5000)
    }
  }

  function formatDate(dateString) {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  }

const filteredEvents = (playlistFilters.has('all')
    ? userEvents
    : userEvents.filter(e => e.playlist.some(p => playlistFilters.has(p)))
  ).sort((a, b) => new Date(b.date) - new Date(a.date))

  const apiPlaylists = userPlaylists.filter(p => p.apiSyncEnabled)
  const manualPlaylists = userPlaylists.filter(p => 
    !p.handle.toLowerCase().includes('ticketmaster') && 
    !p.handle.toLowerCase().includes('eventbrite')
  )

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-gray-600">Loading...</div></div>

  return (
    <>
      <Head>
        <title>Dashboard - LOCOL</title>
      </Head>

      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="text-2xl font-bold text-gray-900 cursor-pointer" onClick={() => router.push('/')}>
              LOCOL
            </div>
            <div className="flex gap-8 items-center">
              <a href="/" className="text-gray-700 hover:text-gray-900 font-medium">What's on?</a>
              <a href="/dashboard" className="text-gray-700 hover:text-gray-900 font-medium">Dashboard</a>
              <div className="flex items-center gap-2 pl-4 border-l border-gray-300">
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold text-sm">
                  L
                </div>
                <span className="text-sm text-gray-700">Luc (me)</span>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <div className="bg-gray-50 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Dashboard</h1>
            <p className="text-gray-600">Manage your playlists and events</p>
          </div>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">My Playlists</h2>
            
	  {manualPlaylists.length > 0 && (
	                <>
	                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Manual Curation</h3>
	                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
	                    {manualPlaylists.map(playlist => {
	                      const status = Array.isArray(playlist.verificationStatus) 
	                        ? playlist.verificationStatus[0] 
	                        : playlist.verificationStatus
	                      const eventCount = userEvents.filter(e => e.playlist.includes(playlist.handle)).length
                    
	                      return (
	                        <button
	                          key={playlist.id}
	                          onClick={() => togglePlaylistFilter(playlist.handle)}
							  className={`rounded-lg p-4 hover:shadow-md transition text-left ${
							                            playlistFilters.has(playlist.handle)
							                              ? 'bg-blue-50 border-2 border-blue-500'
							                              : 'bg-white border border-gray-200 hover:border-blue-300'
							                          }`}
	                        >
	                          <div className="text-base font-bold text-blue-600 mb-1">{playlist.handle}</div>
	                          <div className="text-xs text-gray-600 mb-3">{playlist.name}</div>
	                          <div className="flex justify-between items-center">
	                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
	                              status === 'Verified' 
	                                ? 'bg-green-100 text-green-800'
	                                : 'bg-yellow-100 text-yellow-800'
	                            }`}>
	                              {status}
	                            </span>
	                            <span className="text-xs text-gray-600">{eventCount}</span>
	                          </div>
	                        </button>
	                      )
	                    })}
	                  </div>
	                </>
	              )}

	              {apiPlaylists.length > 0 && (
	                <>
	                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-semibold text-gray-700">API Synced</h3>
                  <button
                    onClick={syncAllAPIs}
                    disabled={isSyncing}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      isSyncing
                        ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        : 'bg-purple-600 text-white hover:bg-purple-700'
                    }`}
                  >
                    <span>{isSyncing ? '⟳ Syncing...' : '⟳ Sync All APIs'}</span>
                  </button>
                </div>
                {syncMessage && (
                  <div className={`text-sm mb-3 px-3 py-2 rounded ${
                    syncMessage.startsWith('✓')
                      ? 'bg-green-50 text-green-700'
                      : 'bg-red-50 text-red-700'
                  }`}>
                    {syncMessage}
                  </div>
                )}
	                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
	                    {apiPlaylists.map(playlist => {
	                      const status = Array.isArray(playlist.verificationStatus) 
	                        ? playlist.verificationStatus[0] 
	                        : playlist.verificationStatus
	                      const eventCount = userEvents.filter(e => e.playlist.includes(playlist.handle)).length
                    
	                      return (
	                        <button
	                          key={playlist.id}
	                          onClick={() => togglePlaylistFilter(playlist.handle)}
							  className={`rounded-lg p-4 hover:shadow-md transition text-left ${
							                            playlistFilters.has(playlist.handle)
							                              ? 'bg-purple-50 border-2 border-purple-500'
							                              : 'bg-white border border-gray-200 hover:border-purple-300'
							                          }`}
	                        >
	                          <div className="text-base font-bold text-purple-600 mb-1">{playlist.handle}</div>
	                          <div className="text-xs text-gray-600 mb-3">{playlist.name}</div>
	                          <div className="flex justify-between items-center">
	                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
	                              status === 'Verified' 
	                                ? 'bg-green-100 text-green-800'
	                                : 'bg-yellow-100 text-yellow-800'
	                            }`}>
	                              {status}
	                            </span>
	                            <span className="text-xs text-gray-600">{eventCount}</span>
	                          </div>
	                        </button>
	                      )
	                    })}
	                  </div>
	                </>
	              )}
          </section>

          <section className="mb-12">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">My Events</h2>
              <button
                onClick={() => {
                  setIsAddingInline(true)
                  setEditingEvent(null)
                  setNewEvent({ event: '', when: '', link: '', playlist: '' })
                }}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium transition"
              >
                + Add Event
              </button>
            </div>
            
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Event</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Playlist</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {/* Inline Add Row */}
                    {isAddingInline && (
                      <tr className="bg-blue-50 border-2 border-blue-300">
                        <td className="px-6 py-4">
                          <input
                            type="text"
                            placeholder="Event name..."
                            value={newEvent.event}
                            onChange={(e) => setNewEvent({...newEvent, event: e.target.value})}
                            maxLength={100}
                            className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <input
                            type="date"
                            value={newEvent.when}
                            onChange={(e) => setNewEvent({...newEvent, when: e.target.value})}
                            className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <select
                            value={newEvent.playlist}
                            onChange={(e) => setNewEvent({...newEvent, playlist: e.target.value})}
                            className="w-full px-3 py-2 text-sm text-gray-900 bg-white border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Choose playlist...</option>
                            {userPlaylists.map(p => (
                              <option key={p.id} value={p.handle}>{p.handle}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          {/* Empty - no status needed for new row */}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-3">
                            <button
                              onClick={async () => {
                                if (!newEvent.event || !newEvent.when || !newEvent.playlist) {
                                  alert('Please fill all required fields')
                                  return
                                }
                                const playlist = userPlaylists.find(p => p.handle === newEvent.playlist)
                                try {
                                  await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Events`, {
                                    method: 'POST',
                                    headers: {
                                      'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
                                      'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                      records: [{
                                        fields: {
                                          'Event': newEvent.event,
                                          'When': newEvent.when,
                                          'Link': newEvent.link || '',
                                          'Playlist': [playlist.id]
                                        }
                                      }]
                                    })
                                  })
                                  setIsAddingInline(false)
                                  setNewEvent({ event: '', when: '', link: '', playlist: '' })
                                  fetchUserData()
                                } catch (error) {
                                  alert('Error: ' + error.message)
                                }
                              }}
                              className="text-green-600 hover:text-green-800 text-sm font-medium"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setIsAddingInline(false)
                                setNewEvent({ event: '', when: '', link: '', playlist: '' })
                              }}
                              className="text-red-600 hover:text-red-800 text-sm font-medium"
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {filteredEvents.slice(0, displayCount).length === 0 ? (
                      <tr>
                        <td colSpan="5" className="px-6 py-12 text-center text-gray-500">No events yet</td>
                      </tr>
                    ) : (
                      filteredEvents.slice(0, displayCount).map(event => {
                        const status = Array.isArray(event.verificationStatus) 
                          ? event.verificationStatus[0] 
                          : event.verificationStatus
                        
                        return (
                          <tr key={event.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 text-sm text-gray-900">{event.title}</td>
                            <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">{formatDate(event.date)}</td>
                            <td className="px-6 py-4 text-sm text-gray-900">{event.playlist.join(', ')}</td>
                            <td className="px-6 py-4">
                              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                status === 'Verified' 
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}>
                                {status}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex gap-3">
                                <button 
                                  onClick={() => startEdit(event)}
                                  className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                                >
                                  Edit
                                </button>
                                <button 
                                  onClick={() => deleteEvent(event.id)}
                                  className="text-red-600 hover:text-red-800 text-sm font-medium"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Load More button */}
            {filteredEvents.length > displayCount && (
              <div className="text-center mt-6">
                <button
                  onClick={() => setDisplayCount(prev => prev + 50)}
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium transition"
                >
                  Load More ({filteredEvents.length - displayCount} remaining)
                </button>
              </div>
            )}
          </section>

        </div>
      </div>
    </>
  )
}