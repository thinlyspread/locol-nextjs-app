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
  const CURRENT_USER = 'Luc (me)'

  useEffect(() => {
    fetchUserData()
  }, [])

  async function fetchUserData() {
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

      const transformedPlaylists = playlistsData.records.map(record => ({
        id: record.id,
        handle: record.fields.Handle,
        name: record.fields['Playlist Name'],
        owner: record.fields['Playlist Owner']?.map(id => userIdToName[id]) || [],
        verificationStatus: record.fields.Playlist_Verification_Status
      }))

      const transformedEvents = eventsData.records.map(record => ({
        id: record.id,
        title: record.fields.Event,
        date: record.fields.When,
        link: record.fields.Link,
        playlist: record.fields.Playlist?.map(id => playlistIdToHandle[id]) || [],
        submittedBy: record.fields.Submitted_By?.map(id => userIdToName[id]) || [],
        verificationStatus: record.fields.Playlist_Verification_Status
      }))

      const myPlaylists = transformedPlaylists.filter(p => p.owner.includes(CURRENT_USER))
      const myEvents = transformedEvents.filter(e => e.submittedBy?.includes(CURRENT_USER))

      console.log('All events:', transformedEvents.length)
      console.log('My events:', myEvents.length)
      console.log('Sample event submittedBy:', transformedEvents[0]?.submittedBy)

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
      fetchUserData()
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

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-gray-600">Loading...</div></div>

  return (
    <>
      <Head>
        <title>Dashboard - LOCOL</title>
      </Head>

      {/* Navigation */}
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
          
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Dashboard</h1>
            <p className="text-gray-600">Manage your playlists and events</p>
          </div>

          {/* My Playlists */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">My Playlists</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {userPlaylists.map(playlist => {
                const status = Array.isArray(playlist.verificationStatus) 
                  ? playlist.verificationStatus[0] 
                  : playlist.verificationStatus
                const eventCount = userEvents.filter(e => e.playlist.includes(playlist.handle)).length
                
                return (
                  <div key={playlist.id} className="bg-white border border-gray-200 rounded-lg p-6">
                    <div className="text-lg font-bold text-blue-600 mb-1">{playlist.handle}</div>
                    <div className="text-sm text-gray-600 mb-4">{playlist.name}</div>
                    <div className="flex justify-between items-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
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
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">My Events</h2>
              <button 
                onClick={() => document.getElementById('eventForm').scrollIntoView({ behavior: 'smooth' })}
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
                    {userEvents.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="px-6 py-12 text-center text-gray-500">No events yet</td>
                      </tr>
                    ) : (
                      userEvents.map(event => {
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
                              <button 
                                onClick={() => deleteEvent(event.id)}
                                className="text-red-600 hover:text-red-800 text-sm font-medium"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Add Event Form */}
          <section className="bg-white border border-gray-200 rounded-lg p-8" id="eventForm">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Add New Event</h2>
            
            <form onSubmit={handleCreateEvent} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Select Playlist*</label>
                <select 
                  name="playlist" 
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
                  className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required 
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">Event Link (URL)</label>
                <input 
                  type="url" 
                  name="link"
                  placeholder="https://example.com" 
                  className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-4">
                <button 
                  type="submit" 
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold transition"
                >
                  Submit Event
                </button>
                <button 
                  type="reset" 
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