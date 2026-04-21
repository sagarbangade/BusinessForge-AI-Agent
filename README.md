# BusinessForge-AI-Agent

BusinessForge is a powerful, AI-driven lead generation and tech audit tool designed for digital agencies, freelancers, and sales teams. It automates the process of finding local businesses, auditing their digital presence, and generating personalized outreach pitches.

## 🚀 Key Features

- **Niche-Specific Targeting**: Refine your search by specific business niches (e.g., "Italian Restaurants", "Plumbing Services") for highly relevant leads.
- **AI-Powered Lead Scoring**: Automatically scores leads based on their "Tech Need" (e.g., missing website, broken links, poor SEO, no SSL, not mobile-friendly).
- **Personalized Cold Email Generator**: Uses Gemini AI to analyze a lead's specific weaknesses and generate a tailored outreach pitch in seconds.
- **Mini-CRM (Saved Leads)**: Save promising leads to your local storage for later follow-up.
- **Deep Tech Audits**:
  - **SSL Check**: Detects insecure `http://` connections.
  - **Mobile-Friendly Check**: Identifies sites missing viewport optimization.
  - **SEO Audit**: Checks for basic meta tags (title, description).
  - **Website Reachability**: Detects broken or offline websites.
- **Multi-Source Discovery**: Combines data from Google Places (optional), OpenStreetMap (Overpass API), and AI-driven web searches.
- **Interactive Cyberpunk UI**: A real-time dashboard with a live agent activity feed and interactive map.
- **CSV Export**: Easily export your verified leads for use in other CRM tools.

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS 4, GSAP (Animations).
- **Maps**: Leaflet, React-Leaflet.
- **AI**: Google Gemini API (`@google/genai`).
- **Data Sources**: OpenStreetMap (Nominatim, Overpass API), Google Places API (Optional).
- **Icons**: Lucide-React.

## ⚙️ Setup & Installation

### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd BusinessForge-AI-Agent
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Variables
Create a `.env` file (or set these in your hosting environment):
```env
GEMINI_API_KEY=your_gemini_api_key_here
GOOGLE_PLACES_API_KEY=your_google_places_api_key_here (optional)
```

### 4. Run the Development Server
```bash
npm run dev
```
The app will be available at `http://localhost:3000`.

## 📖 How to Use

1. **Configure Settings**: Click the ⚙️ icon to set your search radius and enter your API keys if not set in the environment.
2. **Search**: Enter a city and a target niche (e.g., "New York", "Dentists").
3. **Analyze**: Watch the AI agents (NicheRefiner, DiscoverySwarm, WebIntelligence, etc.) work in real-time to find and audit leads.
4. **Review**: Click on a lead in the table or on the map to see detailed tech audit results and AI analysis.
5. **Outreach**: Click "Generate Pitch" to get a personalized cold email for that specific lead.
6. **Save & Export**: Save your favorite leads and export the entire list to CSV.

## 🔒 Privacy & Security

- API keys entered in the UI are stored only in your browser's `localStorage`.
- No data is sent to external servers except for the necessary API calls to Google and OpenStreetMap.

## 📄 License

MIT License - feel free to use and modify for your own projects!
