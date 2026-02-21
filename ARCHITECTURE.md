# LOCOL Platform Architecture

## Overview
LOCOL is a local events aggregation platform that combines multiple data sources (APIs and web scraping) to provide users with comprehensive event listings and multiple ticket purchasing options.

---

## Core Principle: Multi-Source Event Aggregation

**Goal:** Show users the SAME event with ALL available ticket sources, encouraging venues/publishers to claim their playlist profiles.

**Strategy:** Domain-based display with verification status creates perception of platform activity while incentivizing direct publisher participation.

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    DATA SOURCES                             │
├─────────────────────────────────────────────────────────────┤
│  APIs              │  Web Scrapers                          │
│  • Ticketmaster    │  • Browse AI robots (Brighton Dome,   │
│  • Skiddle         │    Festival, etc.)                     │
│                    │  • Custom scrapers                      │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                  STAGING TABLE                              │
├─────────────────────────────────────────────────────────────┤
│  Fields:                                                    │
│  • Event (transformed title)                                │
│  • When (YYYY-MM-DD)                                        │
│  • Link (primary URL)                                       │
│  • Links (JSON array with playlist attribution)            │
│  • Playlist (handle like @Ticketmaster)                     │
│  • Source (data source identifier)                          │
│  • Status (Approved/Published/Rejected)                     │
│  • Published Event ID (link to Events record)               │
│                                                             │
│  Purpose: Staging area for deduplication before publishing │
└─────────────────────────────────────────────────────────────┘
                          ↓
              /api/publish-staging
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                   EVENTS TABLE                              │
├─────────────────────────────────────────────────────────────┤
│  Fields:                                                    │
│  • Event, When, Link, Links                                 │
│  • Playlist (array of playlist IDs)                         │
│                                                             │
│  Purpose: Live events visible to users                      │
└─────────────────────────────────────────────────────────────┘
                          ↓
           /api/deduplicate-events
                          ↓
┌─────────────────────────────────────────────────────────────┐
│              MERGED EVENTS (same record)                    │
├─────────────────────────────────────────────────────────────┤
│  Event: "Suede (Rock) @ The Brighton Centre"               │
│  Playlist: [@Ticketmaster, @Skiddle]                        │
│  Links: [                                                   │
│    {playlist:"@Ticketmaster", url:"https://tm.com/..."},    │
│    {playlist:"@Skiddle", url:"https://skiddle.com/..."}     │
│  ]                                                          │
└─────────────────────────────────────────────────────────────┘
                          ↓
                    LIVE FEED
              (pages/index.js)
```

---

## Duplicate Detection (3 Levels)

### **Level 1: API/Scraper Self-Deduplication**
**Location:** Individual sync scripts (`sync-ticketmaster.js`, `sync-skiddle.js`, `webhook-scraper.js`)

**Logic:**
```javascript
// Fetch existing events from same source
const existingEvents = await getExistingInStaging('Ticketmaster')
const key = `${event.name}|${event.date}|${source}`

// Skip if duplicate within same source
if (existingEvents.has(key)) skip()
```

**Purpose:** Prevent duplicate Brighton/Worthing API results from same source

**Example:** Ticketmaster returns same event for both Brighton and Worthing searches → only insert once

---

### **Level 2: Cross-Source Staging Deduplication**
**Location:** `webhook-scraper.js` (lines 37-50)

**Logic:**
```javascript
// Check ALL sources in Staging
const existingEvents = new Set(
  stagingRecords.map(r => `${r.Event}|${r.When}|${r.Source}`)
)

// Allow same event from different sources
const key = `${Event}|${When}|${Source}`
if (existingEvents.has(key)) skip()
```

**Purpose:** Allow same event from multiple sources while preventing exact duplicates

**Example:** 
- ✅ ALLOW: Brighton Dome scraper + Universe scraper (different sources)
- ❌ BLOCK: Universe scraper called twice (same source)

---

### **Level 3: Events Table Deduplication** 
**Location:** `/api/deduplicate-events`

**Logic:**
```javascript
// Group by Event name + Date
const groups = events.groupBy(e => `${e.Event}|${e.When}`)

// Find duplicates
const duplicates = groups.filter(g => g.length > 1)

// Merge: Keep first, merge Playlist arrays + Links arrays, delete rest
for (const group of duplicates) {
  keeper.Playlist = [...all unique playlists]
  keeper.Links = [...all links from all sources]
  delete duplicates
}
```

**Purpose:** Merge cross-source events into single records with multiple ticket links

**Example:**
- Before: 3 records (Ticketmaster, Skiddle, Brighton Dome) 
- After: 1 record with 3 playlists and 3 ticket links

**CRITICAL:** This step is REQUIRED after every publish. It's not just for testing.

---

## Title Formatting Strategy

### **Universal Bucket Fields**
All data sources (APIs and scrapers) are transformed into standardized fields before insertion:

```javascript
{
  Title: "Main event name",
  Subtitle: "Secondary info (optional)",
  Category: "Genre/Type (optional)", 
  Venue: "Location name (optional)",
  Date: "Date string",
  Link: "Event URL"
}
```

### **Title Construction**
**Format:** `{Title} {Subtitle} ({Category}) @ {Venue}`

**Rules:**
- Join with single spaces (no dashes)
- Filter out empty/null fields
- Must match across all sources for deduplication

**Examples:**
```
API:     "Suede (Rock) @ The Brighton Centre"
Scraper: "Suede (Rock) @ The Brighton Centre"  ✅ MATCH

Wrong:   "Suede - (Rock) - @ The Brighton Centre"  ❌ NO MATCH
```

---

## API Field Mapping

### **Ticketmaster** (`sync-ticketmaster.js`)
```javascript
/**
 * Available fields:
 * - name: Event name
 * - classifications[0].genre.name: Genre
 * - _embedded.venues[0].name: Venue
 * - dates.start.localDate: Date (YYYY-MM-DD)
 * - url: Ticket link
 * 
 * Current format: {name} ({genre}) @ {venue}
 */
```

### **Skiddle** (`sync-skiddle.js`)
```javascript
/**
 * Available fields:
 * - eventname: Event name
 * - EventCode: Type (CLUB, LIVE, FEST)
 * - venue.name: Venue name
 * - date: Date (YYYY-MM-DD)
 * - link: Ticket link
 * 
 * Current format: {eventname} ({EventCode}) @ {venue}
 */
```

---

## Dynamic Playlist Mapping

### **How It Works**
The webhook dynamically maps event link domains to playlist handles by looking up the Playlists table in Airtable.

**Process:**
1. Extract domain from event link (e.g., `universe.com`)
2. Fetch all records from Playlists table
3. Parse Website field to get domain (normalize: strip protocol, www, lowercase)
4. Match link domain → Website domain → Handle
5. Use matched Handle or create fallback

**Code:** `webhook-scraper.js` (lines 16-33)

```javascript
// Fetch Playlists from Airtable
const playlistsRes = await fetch('/Playlists')

// Build domain → handle map
const domainToPlaylist = new Map()
playlistsData.records.forEach(p => {
  const domain = normalizeDomain(p.fields.Website)
  domainToPlaylist.set(domain, p.fields.Handle)
})

// Match link domain
const linkDomain = normalizeDomain(event.Link)
const playlist = domainToPlaylist.get(linkDomain) || `@${linkDomain.split('.')[0]}`
```

### **Playlists Table Structure**
```
Handle                  | Website
------------------------|----------------------------------
@Universe               | https://www.universe.com
@BrightonDome           | https://brightondome.org
@Ticketmaster           | https://www.ticketmaster.co.uk
```

### **Domain Normalization**
All domains normalized to: `example.com` (lowercase, no protocol, no www)

**Examples:**
```
https://www.universe.com  → universe.com
http://Universe.com       → universe.com
www.UNIVERSE.COM          → universe.com
```

### **Why Dynamic?**
- **No code changes needed** when adding new sources
- **Just add playlist to Airtable** with Website field
- Webhook automatically picks it up on next run

**Before (hardcoded):**
```javascript
// Had to update code for each new source
const domainMap = {
  'universe.com': '@Universe',
  'brightondome.org': '@BrightonDome'
}
```

**After (dynamic):**
```javascript
// Just add to Airtable Playlists table:
// Handle: @NewVenue | Website: https://newvenue.com
// Webhook automatically uses it
```

---

## Date Parsing

### **Input Formats Supported**
- Single dates: "Wed 20 May", "20 May 2026"
- Date ranges: "15 - 20 March", "Fri 20 - Sun 22 Feb"
- With times: "20 May, 7:30pm" (time stripped)
- With day names: "Monday 15 March" (day stripped)

### **Parsing Logic** (`webhook-scraper.js` lines 170-240)

**Steps:**
1. Clean: Remove parentheses and times
2. Strip day names (Monday, Tue, etc.)
3. Parse month names (full or abbreviated)
4. Infer year if missing (defaults to current year)
5. For ranges: Parse end date first, use its year/month for start date
6. Return first date (webhook uses first date only)

**Examples:**
```
Input:  "Fri 20 - Sun 22 Feb"
Output: "2026-02-20" (first date in range)

Input:  "15 - 20 March"
Output: "2026-03-15"

Input:  "Wed 25 Feb, 7:30pm"
Output: "2026-02-25"
```

**Critical:** All sources must produce `YYYY-MM-DD` format for deduplication to work.

---

## Display Logic (Feed)

### **Domain-Based Display**
Event cards show domains with verification status instead of playlist names.

**Why domains not playlists?**
- Users recognize domains (universe.com) more than handles (@Universe)
- Creates marketplace perception (multiple sellers)
- Incentivizes venues to claim domains

### **Verification Icons**
```
✓ (green)  = Verified playlist (Playlist_Verification_Status = "Verified")
! (orange) = Unverified playlist (status = "Unverified")
(hidden)   = Banned or no playlist exists
```

**Code:** `pages/index.js` (lines 357-410)

```javascript
// Parse Links array, extract unique domains
const uniqueDomains = Array.from(
  new Map(
    event.links.map(link => [getDomain(link.url), link])
  ).values()
)

// Show with verification icons
uniqueDomains.map(item => {
  const playlistExists = playlists.find(p => p.handle === item.playlist)
  const icon = playlistExists ? '✓' : '!'
  return <a href={item.url}>{icon} {item.domain}</a>
})
```

### **Date Filtering**
**Display window:** Yesterday → 2 weeks from today

**Storage:** All future events (no limit)

**Rationale:** Events "appear" as they enter the window, storage is cheap

**Code:** `pages/index.js` (lines 122-127)

---

## Links Field Structure

### **Format**
JSON array of objects with playlist attribution:

```json
[
  {"playlist": "@Ticketmaster", "url": "https://ticketmaster.co.uk/event123"},
  {"playlist": "@Skiddle", "url": "https://skiddle.com/event456"},
  {"playlist": "@BrightonDome", "url": "https://brightondome.org/event789"}
]
```

### **Why This Structure?**
- **Preserves source attribution** (which playlist provided each link)
- **Enables domain deduplication** (multiple playlists can share same domain)
- **Supports cross-verification** (Ticketmaster returning Universe link)

### **Deduplication by Domain**
When displaying, domains are deduplicated to prevent showing universe.com twice:

```javascript
// Before dedup: 
[
  {playlist: "@Ticketmaster", url: "https://universe.com/a"},
  {playlist: "@Universe", url: "https://universe.com/b"}
]

// After dedup (display):
universe.com (shows first URL found)
```

---

## Browse AI Webhook Integration

### **Webhook Endpoint**
`/api/webhook-scraper`

**URL:** `https://locol-nextjs-app.vercel.app/api/webhook-scraper`

**Trigger:** Task finished successfully

### **Payload Structure**
```json
{
  "event": "task.finishedSuccessfully",
  "task": {
    "capturedLists": {
      "Events": [
        {
          "Title": "Event Name",
          "Subtitle": "Optional subtitle",
          "Category": "Genre/Type",
          "Venue": "Location",
          "Date": "Date string",
          "Link": "URL"
        }
      ]
    }
  }
}
```

### **Robot Configuration**
**Universal bucket fields (name these in Browse AI):**
- Title (required)
- Subtitle (optional)
- Category (optional)
- Venue (optional)
- Date (required)
- Link (required)

**Why universal?** Same field names work for all venues/sources. Just configure Browse AI robots to use these field names.

### **Array Handling**
Webhook processes ALL items in the captured list array:

```javascript
for (const item of capturedLists.Events) {
  transform(item)
  checkDuplicate(item)
  insert(item)
}
```

**Result:** One Browse AI task can insert dozens of events in a single webhook call.

---

## Common Pitfalls & Fixes

### **1. Title Format Mismatch**
**Problem:** Scraped events use dashes, API events don't
```
API:     "Event (Music) @ Venue"
Scraper: "Event - (Music) - @ Venue"  ❌
```

**Fix:** Use single spaces everywhere (`eventParts.join(' ')`)

### **2. Duplicate Detection Too Strict**
**Problem:** Same event from different sources blocked

**Fix:** Include Source in duplicate key: `Event|Date|Source`

### **3. Playlist Mapping Hardcoded**
**Problem:** Adding new source requires code change

**Fix:** Dynamic lookup from Airtable Playlists.Website field

### **4. Publish Fails with "Invalid Record ID"**
**Problem:** Playlist handle doesn't exist in Playlists table

**Fix:** Ensure Website field populated for all playlists, or handle missing playlists gracefully:
```javascript
'Playlist': playlistMap[handle] ? [playlistMap[handle]] : []
```

### **5. Missing universe.com Link**
**Problem:** Duplicate detection blocked Universe scraper because Brighton Dome scraper already inserted same event

**Fix:** Source-aware duplicate key allows both

---

## Operational Workflows

### **Adding a New API Source**
1. Create `/api/sync-newsource.js`
2. Add field mapping comment block
3. Transform to universal bucket format
4. Build title: `{name} ({category}) @ {venue}`
5. Create Staging records with Links array
6. Set Status='Approved', Playlist='@NewSource'
7. Test with `/api/sync-newsource`
8. Add to regular sync schedule

### **Adding a New Scraper**
1. Create Browse AI robot
2. Configure fields: Title, Subtitle, Category, Venue, Date, Link
3. Add webhook: `https://locol-nextjs-app.vercel.app/api/webhook-scraper`
4. Create playlist in Airtable with Website field
5. Test scrape → check Staging
6. Webhook automatically maps domain → playlist

### **Daily Operations**
```bash
# 1. Sync APIs
curl /api/sync-ticketmaster
curl /api/sync-skiddle

# 2. Scrapers run on schedule (Browse AI triggers webhook)

# 3. Publish new events
curl /api/publish-staging

# 4. Deduplicate (REQUIRED)
curl /api/deduplicate-events
```

**Critical:** Steps 3 and 4 must run together. Publishing without deduplication = duplicate events in feed.

---

## Frontend Display

### **Event Card**
```
Event Title (Category) @ Venue
Date
✓ domain1.com ↗ • ✓ domain2.com ↗ • ! domain3.com ↗
```

### **Playlist Filters**
Shows all playlists with events, allows filtering by playlist:
```
@BrightonDome @Ticketmaster @Skiddle @Universe
```

### **Date Filters**
```
#Today #Tomorrow
```

### **Search**
Full-text search on event names

---

## Roadmap Items

### **High Priority**
- [ ] Automated daily sync schedule (cron)
- [ ] Better UX for "+1 more" links (show all or expandable)
- [ ] Review date filtering strategy (hard limits vs display filtering)
- [ ] Verification system refinement (show ✓ only for Verified playlists)

### **Medium Priority**
- [ ] Playlist profile pages
- [ ] Venue claiming workflow
- [ ] Multi-date event handling (currently uses first date only)
- [ ] Image support from API/scraper data

### **Low Priority**
- [ ] Admin dashboard for manual event curation
- [ ] Analytics on ticket click-throughs
- [ ] Email notifications for new events

---

## Technical Decisions Log

### **Why Staging → Events instead of direct insert?**
Allows review/approval workflow and deduplication before publishing.

### **Why not deduplicate in Staging?**
Staging preserves source attribution. Deduplication happens in Events where users see merged results.

### **Why domain display instead of playlist names?**
Users recognize "universe.com" more than "@Universe". Creates marketplace feel.

### **Why dynamic playlist mapping?**
Scalability. Adding 50 venues shouldn't require 50 code changes.

### **Why use first date for ranges?**
Events typically marketed by start date. Full range expansion possible later.

### **Why separate API syncs from scrapers?**
Different error handling, rate limits, and schedules. APIs batch sync, scrapers webhook-driven.

---

## Environment Variables

```env
NEXT_PUBLIC_AIRTABLE_API_KEY=your_key
NEXT_PUBLIC_AIRTABLE_BASE_ID=your_base_id
NEXT_PUBLIC_TICKETMASTER_KEY=your_tm_key
NEXT_PUBLIC_SKIDDLE_KEY=your_skiddle_key
```

---

## File Structure

```
/pages
  /api
    sync-ticketmaster.js    - Ticketmaster API sync
    sync-skiddle.js         - Skiddle API sync
    webhook-scraper.js      - Browse AI webhook handler
    publish-staging.js      - Staging → Events
    deduplicate-events.js   - Cross-source merge
    test-api-sync.js        - Testing endpoint
  index.js                  - Main feed UI

/ARCHITECTURE.md            - This file
/README.md                  - Project overview
```

---

Last updated: 2026-02-21
