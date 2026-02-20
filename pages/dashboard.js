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
        verificationStatus: record.fields.Playlist_Verification_Status
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
    document.getElementById('eventForm').scrollIntoView({ behavior: 'smooth' })
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

  function formatDate(dateString) {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  }

const filteredEvents = playlistFilters.has('all')
    ? userEvents
    : userEvents.filter(e => e.playlist.some(p => playlistFilters.has(p)))

  const apiPlaylists = userPlaylists.filter(p => 
    p.handle.toLowerCase().includes('ticketmaster') || 
    p.handle.toLowerCase().includes('eventbrite')
  )
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
	                  <h3 className="text-sm font-semibold text-gray-700 mb-3">API Synced</h3>
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

          <section className="bg-white border border-gray-200 rounded-lg p-8" id="eventForm">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {editingEvent ? 'Edit Event' : 'Add New Event'}
            </h2>
            
            <form onSubmit={editingEvent ? handleUpdateEvent : handleCreateEvent} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Select Playlist*</label>
                <select 
                  name="playlist" 
                  key={editingEvent?.id || 'new'}
                  defaultValue={editingEvent?.playlist[0] || ''}
                  className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Choose a playlist...</option>
                  {userPlaylists.map(p => (
                    <option key={p.id} value={p.handle}>{p.handle}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Event Name*</label>
                <input 
                  type="text" 
                  name="event"
                  defaultValue={editingEvent ? editingEvent.title : ''}
                  placeholder="e.g., Summer Music Festival" 
                  className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required 
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Date*</label>
                <input 
                  type="date" 
                  name="when"
                  defaultValue={editingEvent ? editingEvent.date : ''}
                  className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required 
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Event Link (URL)</label>
                <input 
                  type="url" 
                  name="link"
                  defaultValue={editingEvent ? editingEvent.link : ''}
                  placeholder="https://example.com" 
                  className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-4">
                <button 
                  type="submit" 
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold transition"
                >
                  {editingEvent ? 'Update Event' : 'Submit Event'}
                </button>
                {editingEvent && (
                  <button 
                    type="button"
                    onClick={cancelEdit}
                    className="bg-white text-gray-700 border border-gray-300 px-6 py-3 rounded-lg hover:bg-gray-50 font-semibold transition"
                  >
                    Cancel Edit
                  </button>
                )}
                <button 
                  type="reset" 
                  onClick={() => setEditingEvent(null)}
                  className="bg-white text-gray-700 border border-gray-300 px-6 py-3 rounded-lg hover:bg-gray-50 font-semibold transition"
                >
                  Clear Form
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </>
  )
}