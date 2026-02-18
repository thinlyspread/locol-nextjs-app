import { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'

export default function Dashboard() {
  const router = useRouter()
  const [userPlaylists, setUserPlaylists] = useState([])
  const [userEvents, setUserEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingEventId, setEditingEventId] = useState(null)
  
  const AIRTABLE_API_KEY = process.env.NEXT_PUBLIC_AIRTABLE_API_KEY
  const AIRTABLE_BASE_ID = process.env.NEXT_PUBLIC_AIRTABLE_BASE_ID
  const CURRENT_USER = 'Luc (me)' // Mocked - will be real auth later

  useEffect(() => {
    fetchUserData()
  }, [])

  async function fetchUserData() {
    try {
      // Fetch all tables
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

      // Create lookup maps
      const playlistIdToHandle = {}
      playlistsData.records.forEach(p => {
        playlistIdToHandle[p.id] = p.fields.Handle
      })

      const userIdToName = {}
      usersData.records.forEach(u => {
        userIdToName[u.id] = u.fields['User Name']
      })

      // Transform playlists
      const transformedPlaylists = playlistsData.records.map(record => ({
        id: record.id,
        handle: record.fields.Handle,
        name: record.fields['Playlist Name'],
        owner: record.fields['Playlist Owner']?.map(id => userIdToName[id]) || [],
        verificationStatus: record.fields.Playlist_Verification_Status
      }))

	  // Transform events
	  const transformedEvents = eventsData.records.map(record => ({
	    id: record.id,
	    title: record.fields.Event,
	    date: record.fields.When,
	    link: record.fields.Link,
	    playlist: record.fields.Playlist?.map(id => playlistIdToHandle[id]) || [],
	    submittedBy: record.fields.Submitted_By?.map(id => userIdToName[id]) || [],  // ADD THIS MAPPING
	    verificationStatus: record.fields.Playlist_Verification_Status
	  }))

      // Filter user's playlists and events
      const myPlaylists = transformedPlaylists.filter(p => p.owner.includes(CURRENT_USER))
      const myEvents = transformedEvents.filter(e => e.submittedBy?.includes(CURRENT_USER))

      setUserPlaylists(myPlaylists)
      setUserEvents(myEvents)
console.log('All events:', transformedEvents.length)
console.log('My events:', myEvents.length)
console.log('Sample event submittedBy:', transformedEvents[0]?.submittedBy)
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
          method: editingEventId ? 'PATCH' : 'POST',
          headers: {
            'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(editingEventId ? {
            fields: {
              'Event': formData.get('event'),
              'When': formData.get('when'),
              'Link': formData.get('link') || '',
              'Playlist': [playlist.id]
            }
          } : {
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
      setEditingEventId(null)
      fetchUserData() // Reload data
    } catch (error) {
      console.error('Error saving event:', error)
      alert('Error saving event: ' + error.message)
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

  function formatDate(dateString) {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  if (loading) return <div className="text-center py-12">Loading...</div>

  return (
    <>
      <Head>
        <title>Dashboard - LOCOL</title>
      </Head>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="text-2xl font-bold cursor-pointer" onClick={() => router.push('/')}>
            LOCOL
          </div>
          <div className="flex gap-8 items-center">
            <a href="/" className="text-gray-600 hover:text-gray-900">What's on?</a>
            <a href="/dashboard" className="text-gray-600 hover:text-gray-900">Dashboard</a>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold">
                L
              </div>
              <span className="text-sm text-gray-600">Luc (me)</span>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold mb-8">Dashboard</h1>

        {/* My Playlists */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">My Playlists</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {userPlaylists.map(playlist => {
              const status = Array.isArray(playlist.verificationStatus) 
                ? playlist.verificationStatus[0] 
                : playlist.verificationStatus
              const eventCount = userEvents.filter(e => e.playlist.includes(playlist.handle)).length
              
              return (
                <div key={playlist.id} className="border border-gray-200 rounded-lg p-6 bg-gray-50">
                  <div className="text-lg font-bold text-blue-600 mb-1">{playlist.handle}</div>
                  <div className="text-sm text-gray-600 mb-3">{playlist.name}</div>
                  <div className="flex justify-between items-center">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      status === 'Verified' 
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {status}
                    </span>
                    <span className="text-sm text-gray-600">{eventCount} events</span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* My Events */}
        <section className="mb-12">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">My Events</h2>
            <button 
              onClick={() => document.getElementById('eventForm').scrollIntoView({ behavior: 'smooth' })}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              + Add Event
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full border-collapse bg-white">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-3 text-left text-sm font-semibold text-gray-600 border-b">Event</th>
                  <th className="p-3 text-left text-sm font-semibold text-gray-600 border-b">Date</th>
                  <th className="p-3 text-left text-sm font-semibold text-gray-600 border-b">Playlist</th>
                  <th className="p-3 text-left text-sm font-semibold text-gray-600 border-b">Status</th>
                  <th className="p-3 text-left text-sm font-semibold text-gray-600 border-b">Actions</th>
                </tr>
              </thead>
              <tbody>
                {userEvents.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="p-8 text-center text-gray-600">No events yet</td>
                  </tr>
                ) : (
                  userEvents.map(event => {
                    const status = Array.isArray(event.verificationStatus) 
                      ? event.verificationStatus[0] 
                      : event.verificationStatus
                    
                    return (
                      <tr key={event.id} className="border-b hover:bg-gray-50">
                        <td className="p-3">{event.title}</td>
                        <td className="p-3 text-sm text-gray-600">{formatDate(event.date)}</td>
                        <td className="p-3">{event.playlist.join(', ')}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            status === 'Verified' 
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {status}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            <button 
                              onClick={() => deleteEvent(event.id)}
                              className="text-red-600 hover:text-red-800 text-sm font-semibold"
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
        </section>

        {/* Add Event Form */}
        <section className="bg-white border border-gray-200 rounded-lg p-8" id="eventForm">
          <h2 className="text-2xl font-bold mb-6">Add New Event</h2>
          
          <form onSubmit={handleCreateEvent}>
            <div className="mb-6">
              <label className="block font-semibold mb-2">Select Playlist*</label>
              <select name="playlist" className="w-full p-3 border border-gray-300 rounded-lg bg-white" required>
                <option value="">Choose a playlist...</option>
                {userPlaylists.map(p => (
                  <option key={p.id} value={p.handle}>{p.handle}</option>
                ))}
              </select>
            </div>

            <div className="mb-6">
              <label className="block font-semibold mb-2">Event Name*</label>
              <input 
                type="text" 
                name="event"
                placeholder="e.g., Summer Music Festival" 
                className="w-full p-3 border border-gray-300 rounded-lg"
                required 
              />
            </div>

            <div className="mb-6">
              <label className="block font-semibold mb-2">Date*</label>
              <input 
                type="date" 
                name="when"
                className="w-full p-3 border border-gray-300 rounded-lg"
                required 
              />
            </div>

            <div className="mb-6">
              <label className="block font-semibold mb-2">Event Link (URL)</label>
              <input 
                type="url" 
                name="link"
                placeholder="https://example.com" 
                className="w-full p-3 border border-gray-300 rounded-lg"
              />
            </div>

            <div className="flex gap-4">
              <button 
                type="submit" 
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold"
              >
                Submit Event
              </button>
              <button 
                type="reset" 
                className="border border-blue-600 text-blue-600 px-6 py-3 rounded-lg hover:bg-blue-50 font-semibold"
              >
                Clear Form
              </button>
            </div>
          </form>
        </section>
      </div>
    </>
  )
}