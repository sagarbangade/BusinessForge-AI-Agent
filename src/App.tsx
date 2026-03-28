import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { gsap } from 'gsap';
import { Search, MapPin, Download, Loader2, Globe, ShieldCheck, BarChart3, Target, Zap, Filter, ChevronUp, ChevronDown, Merge, SearchCode, Database, ArrowRight, CheckCircle2, AlertTriangle, X, Phone, Mail, Settings } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom Cyberpunk Marker
const cyberIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div class="w-4 h-4 bg-[#00f3ff] rounded-full shadow-[0_0_15px_#00f3ff] border-2 border-white"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

type AgentRole = 'MapCoordinator' | 'BusinessDiscovery' | 'InternetSearch' | 'MergeDeduplicate' | 'WebIntelligence' | 'ContactHunter' | 'DataVerification' | 'LeadScoring';

interface ChatMessage {
  id: string;
  role: AgentRole;
  content: string;
  status: 'thinking' | 'done' | 'error';
  details?: string;
}

interface BusinessLead {
  id: string;
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  phone: string;
  website: string;
  email: string;
  socialLinks: string[];
  hasSEO: boolean;
  isBroken: boolean;
  techNeedScore: number;
  confidence: number;
  sources: string[];
  notes: string;
  hasContact: boolean;
}

const AGENT_CONFIG: Record<AgentRole, { icon: React.ElementType, color: string, name: string }> = {
  MapCoordinator: { icon: MapPin, color: 'text-[#00f3ff]', name: 'Map Coordinator' },
  BusinessDiscovery: { icon: Database, color: 'text-[#ff003c]', name: 'OSM Discovery Agent' },
  InternetSearch: { icon: SearchCode, color: 'text-[#ff9900]', name: 'Internet Search Agent' },
  MergeDeduplicate: { icon: Merge, color: 'text-[#00ccff]', name: 'Merge & Dedupe Agent' },
  WebIntelligence: { icon: Globe, color: 'text-[#00ff66]', name: 'Web Intel Agent' },
  ContactHunter: { icon: Target, color: 'text-[#ff00ff]', name: 'Contact Hunter Agent' },
  DataVerification: { icon: ShieldCheck, color: 'text-[#b026ff]', name: 'Verification Agent' },
  LeadScoring: { icon: BarChart3, color: 'text-[#ffb300]', name: 'Scoring Agent' },
};

const OVERPASS_APIS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter'
];
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';
const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';
const CORS_PROXY = 'https://api.allorigins.win/get?url=';

function MapEvents({ onLocationSelect }: { onLocationSelect: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [leads, setLeads] = useState<BusinessLead[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mapCenter, setMapCenter] = useState<[number, number]>([40.7128, -74.0060]);
  const [selectedLocation, setSelectedLocation] = useState<[number, number] | null>(null);
  const [selectedLead, setSelectedLead] = useState<BusinessLead | null>(null);
  
  // Settings State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [googlePlacesKey, setGooglePlacesKey] = useState(localStorage.getItem('googlePlacesKey') || '');
  const [searchRadius, setSearchRadius] = useState<number>(parseInt(localStorage.getItem('searchRadius') || '2000'));

  // Table State
  const [filterText, setFilterText] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof BusinessLead, direction: 'asc' | 'desc' }>({ key: 'techNeedScore', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const saveSettings = () => {
    localStorage.setItem('googlePlacesKey', googlePlacesKey);
    localStorage.setItem('searchRadius', searchRadius.toString());
    setIsSettingsOpen(false);
  };

  const addMessage = (role: AgentRole, content: string, status: 'thinking' | 'done' | 'error', details?: string) => {
    const id = Math.random().toString(36).substring(7);
    setMessages(prev => [...prev, { id, role, content, status, details }]);
    
    setTimeout(() => {
      gsap.fromTo(`#msg-${id}`, 
        { opacity: 0, x: -20, scale: 0.95 }, 
        { opacity: 1, x: 0, scale: 1, duration: 0.4, ease: "power2.out" }
      );
    }, 50);
    
    return id;
  };

  const updateMessageStatus = (id: string, content: string, status: 'done' | 'error', details?: string) => {
    setMessages(prev => prev.map(msg => msg.id === id ? { ...msg, content, status, details } : msg));
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery) return;
    
    try {
      const res = await fetch(`${NOMINATIM_SEARCH}?format=json&q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        setMapCenter([lat, lon]);
        handleLocationSelect(lat, lon);
      }
    } catch (err) {
      console.error("Search failed", err);
    }
  };

  const searchGemini = async (city: string, lat: number, lng: number) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not configured.");
      }
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Find 15 real, specific local businesses (shops, restaurants, clinics, services) in ${city} near coordinates ${lat}, ${lng} within a ${searchRadius / 1000}km radius. 
        Return ONLY a valid JSON array of objects. No markdown formatting, no backticks.
        Format: [{"name": "Business Name", "address": "Full Address", "website": "https://...", "category": "Restaurant/Clinic/etc", "phone": "+1...", "email": "contact@..."}]`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
        },
      });

      const text = response.text.trim();
      const data = JSON.parse(text);
      
      return data.map((b: any) => ({
        id: Math.random().toString(36).substring(7),
        name: b.name || 'Unknown',
        category: b.category || 'Search Result',
        address: b.address || 'Unknown Address',
        lat: lat,
        lng: lng,
        phone: b.phone || '',
        website: b.website || '',
        email: b.email || '',
        source: 'Google Search via Gemini'
      }));
    } catch (e) {
      console.error("Gemini Search failed", e);
      return [];
    }
  };

  const searchGooglePlaces = async (lat: number, lng: number, radius: number = 2000) => {
    if (!googlePlacesKey) return [];
    try {
      // Using Text Search (New) API
      const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': googlePlacesKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.primaryType,places.websiteUri,places.nationalPhoneNumber,places.location'
        },
        body: JSON.stringify({
          includedTypes: ["restaurant", "store", "health", "cafe", "veterinary_care"],
          maxResultCount: 20,
          locationRestriction: {
            circle: {
              center: { latitude: lat, longitude: lng },
              radius: radius
            }
          }
        })
      });

      if (!response.ok) throw new Error("Places API failed");
      const data = await response.json();
      
      if (!data.places) return [];

      return data.places.map((place: any) => ({
        id: place.id,
        name: place.displayName?.text || 'Unknown',
        category: place.primaryType?.replace(/_/g, ' ') || 'Local Business',
        address: place.formattedAddress || 'Unknown Address',
        lat: place.location?.latitude || lat,
        lng: place.location?.longitude || lng,
        phone: place.nationalPhoneNumber || '',
        website: place.websiteUri || '',
        source: 'Google Places API'
      }));
    } catch (e) {
      console.error("Google Places failed", e);
      return [];
    }
  };

  const handleLocationSelect = async (lat: number, lng: number) => {
    if (isRunning) return;
    setSelectedLocation([lat, lng]);
    setMessages([]);
    setLeads([]);
    setCurrentPage(1);
    setIsRunning(true);

    try {
      // 1. Map Coordinator
      const msg1 = addMessage('MapCoordinator', 'Converting coordinates to location data...', 'thinking');
      const locationData = await fetch(`${NOMINATIM_REVERSE}?format=json&lat=${lat}&lon=${lng}`).then(res => res.json());
      const city = locationData.address?.city || locationData.address?.town || locationData.address?.village || locationData.address?.suburb || 'Unknown Location';
      updateMessageStatus(msg1, `Target acquired: ${city} (${lat.toFixed(4)}, ${lng.toFixed(4)})`, 'done', `Radius set to ${searchRadius / 1000}km for optimal performance.`);

      // 2. Business Discovery (OSM / Google Places)
      const msg2 = addMessage('BusinessDiscovery', `Scanning for businesses within ${searchRadius / 1000}km...`, 'thinking');
      let osmBusinesses: any[] = [];
      
      if (googlePlacesKey) {
        osmBusinesses = await searchGooglePlaces(lat, lng, searchRadius);
        updateMessageStatus(msg2, `Extracted ${osmBusinesses.length} records from Google Places API.`, 'done', `Categories: Shops, Cafes, Clinics, Services.`);
      } else {
        // Overpass Rotation Logic
        let overpassSuccess = false;
        for (const apiEndpoint of OVERPASS_APIS) {
          try {
            const overpassQuery = `
              [out:json][timeout:15];
              (
                node["shop"](around:${searchRadius},${lat},${lng});
                way["shop"](around:${searchRadius},${lat},${lng});
                node["amenity"~"cafe|restaurant|clinic|dentist|veterinary"](around:${searchRadius},${lat},${lng});
                way["amenity"~"cafe|restaurant|clinic|dentist|veterinary"](around:${searchRadius},${lat},${lng});
              );
              out center 150;
            `;
            
            const overpassRes = await fetch(apiEndpoint, { 
              method: 'POST', 
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: `data=${encodeURIComponent(overpassQuery)}` 
            });
            
            if (!overpassRes.ok) throw new Error(`Overpass API error (${overpassRes.status})`);
            
            const overpassData = await overpassRes.json();
            osmBusinesses = overpassData.elements.map((el: any) => ({
              id: el.id.toString(),
              name: el.tags?.name || 'Unknown',
              category: el.tags?.shop || el.tags?.amenity || 'Unknown',
              lat: el.lat || el.center?.lat,
              lng: el.lon || el.center?.lon,
              phone: el.tags?.phone || el.tags?.['contact:phone'] || '',
              website: el.tags?.website || el.tags?.['contact:website'] || '',
              address: [el.tags?.['addr:housenumber'], el.tags?.['addr:street']].filter(Boolean).join(' ') || 'Unknown Address',
              source: `https://www.openstreetmap.org/node/${el.id}`
            })).filter((b: any) => b.name !== 'Unknown').slice(0, 100);
            
            overpassSuccess = true;
            updateMessageStatus(msg2, `Extracted ${osmBusinesses.length} records from OpenStreetMap.`, 'done', `Categories: Shops, Cafes, Clinics, Services.`);
            break; // Success, exit loop
          } catch (e) {
            console.warn(`Overpass endpoint ${apiEndpoint} failed, trying next...`);
          }
        }

        // Fallback to Nominatim POI search if all Overpass servers fail
        if (!overpassSuccess) {
          try {
            const nomRes = await fetch(`${NOMINATIM_SEARCH}?format=json&q=businesses+in+${encodeURIComponent(city)}&limit=50`);
            const nomData = await nomRes.json();
            osmBusinesses = nomData.map((el: any) => ({
              id: el.place_id.toString(),
              name: el.name || el.display_name.split(',')[0] || 'Unknown',
              category: el.type || 'Local Business',
              lat: parseFloat(el.lat),
              lng: parseFloat(el.lon),
              phone: '',
              website: '',
              address: el.display_name || 'Unknown Address',
              source: `Nominatim Search`
            })).filter((b: any) => b.name !== 'Unknown');
            updateMessageStatus(msg2, `Overpass failed. Fallback: Extracted ${osmBusinesses.length} records from Nominatim.`, 'done', `Basic POI search executed.`);
          } catch (e) {
            updateMessageStatus(msg2, `All OSM Discovery methods failed. Skipping to web search.`, 'error', 'Servers overloaded.');
          }
        }
      }

      // 3. Internet Search Agent (Gemini Grounding)
      const msg3 = addMessage('InternetSearch', `Performing deep web searches for local businesses in ${city}...`, 'thinking');
      
      const geminiBusinesses = await searchGemini(city, lat, lng);
      
      updateMessageStatus(msg3, `Scraped ${geminiBusinesses.length} results from Google Search via Gemini.`, 'done', `Queries executed: local businesses in ${city}`);

      // 4. Merge & Deduplicate
      const msg4 = addMessage('MergeDeduplicate', 'Merging datasets and removing duplicates...', 'thinking');
      const combined = [...osmBusinesses];
      let duplicatesFound = 0;

      geminiBusinesses.forEach(ddg => {
        const isDup = combined.some(existing => {
          const nameMatch = existing.name.toLowerCase().includes(ddg.name.toLowerCase()) || ddg.name.toLowerCase().includes(existing.name.toLowerCase());
          const webMatch = existing.website && ddg.website && (existing.website.includes(ddg.website) || ddg.website.includes(existing.website));
          return nameMatch || webMatch;
        });

        if (!isDup) {
          combined.push({
            ...ddg,
            sources: [ddg.source]
          });
        } else {
          duplicatesFound++;
          const existing = combined.find(e => e.name.toLowerCase().includes(ddg.name.toLowerCase()) || (e.website && ddg.website && e.website.includes(ddg.website)));
          if (existing) {
            existing.sources = existing.sources || [existing.source];
            if (!existing.sources.includes(ddg.source)) existing.sources.push(ddg.source);
            if (!existing.website && ddg.website) existing.website = ddg.website;
            if (!existing.phone && ddg.phone) existing.phone = ddg.phone;
            if (!existing.email && ddg.email) existing.email = ddg.email;
          }
        }
      });

      // Ensure all have sources array
      combined.forEach(b => {
        if (!b.sources) b.sources = [b.source];
      });

      const finalMerged = combined.slice(0, 120); // Cap at 120 to avoid extreme processing times
      updateMessageStatus(msg4, `Merged into ${finalMerged.length} unique leads.`, 'done', `Removed ${duplicatesFound} duplicates using fuzzy name & URL matching.`);

      if (finalMerged.length === 0) {
        addMessage('LeadScoring', 'No businesses found in this area. Try another location.', 'done');
        setIsRunning(false);
        return;
      }

      // 5. Web Intelligence (Deep Scraping)
      const msg5 = addMessage('WebIntelligence', `Deep scraping websites for ${finalMerged.length} leads...`, 'thinking');
      
      const batchSize = 10;
      const enrichedBusinesses = [];
      
      for (let i = 0; i < finalMerged.length; i += batchSize) {
        const batch = finalMerged.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(async (biz: any) => {
          let webData = { hasWebsite: !!biz.website, isReachable: false, isBroken: false, hasContactInfo: !!biz.phone, emails: [] as string[], socialLinks: [] as string[], hasSEO: false };
          
          if (biz.website) {
            try {
              let urlToFetch = biz.website;
              if (!urlToFetch.startsWith('http')) {
                urlToFetch = 'https://' + urlToFetch;
              }
              const proxyUrl = `${CORS_PROXY}${encodeURIComponent(urlToFetch)}`;
              const res = await fetch(proxyUrl);
              const data = await res.json();
              
              if (data.contents) {
                webData.isReachable = true;
                const parser = new DOMParser();
                const doc = parser.parseFromString(data.contents, 'text/html');
                
                // SEO Check
                const title = doc.querySelector('title')?.textContent;
                const metaDesc = doc.querySelector('meta[name="description"]')?.getAttribute('content');
                if (title && metaDesc) webData.hasSEO = true;

                // Emails
                const mailtoLinks = Array.from(doc.querySelectorAll('a[href^="mailto:"]')).map(a => a.getAttribute('href')?.replace('mailto:', '').split('?')[0]);
                webData.emails = [...new Set(mailtoLinks)].filter(Boolean) as string[];

                // Phones
                const telLinks = Array.from(doc.querySelectorAll('a[href^="tel:"]')).map(a => a.getAttribute('href')?.replace('tel:', '').split('?')[0]);
                const textContent = doc.body?.textContent || '';
                const phoneMatches = textContent.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g);
                const phones = [...new Set([...telLinks, ...(phoneMatches || [])])].filter(Boolean) as string[];
                if (phones.length > 0 && !biz.phone) biz.phone = phones[0];

                // Socials
                const socialDomains = ['facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com'];
                const socialLinks = Array.from(doc.querySelectorAll('a')).map(a => a.href).filter(href => socialDomains.some(d => href.includes(d)));
                webData.socialLinks = [...new Set(socialLinks)];

                if (webData.emails.length > 0 || doc.body?.textContent?.toLowerCase().includes('contact')) {
                  webData.hasContactInfo = true;
                }
              } else {
                webData.isBroken = true;
              }
            } catch (e) {
              webData.isBroken = true;
            }
          }
          return { ...biz, webData };
        }));
        enrichedBusinesses.push(...results);
      }
      
      const brokenCount = enrichedBusinesses.filter(b => b.webData.isBroken).length;
      const noWebCount = enrichedBusinesses.filter(b => !b.webData.hasWebsite).length;
      updateMessageStatus(msg5, `Scraping complete.`, 'done', `Found ${noWebCount} without websites, ${brokenCount} with broken sites. Extracted emails & socials.`);

      // 5.5 Contact Hunter Agent (Deep Search)
      const msgHunter = addMessage('ContactHunter', `Deploying deep search for missing phone numbers and emails...`, 'thinking');
      const needsContact = enrichedBusinesses.filter(b => !b.phone && b.webData.emails.length === 0 && !b.email).slice(0, 15); // Limit to 15 to avoid massive prompts

      if (needsContact.length > 0) {
        try {
          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
          const prompt = `Find the phone number and email address for the following local businesses. Use Google Search to find their public contact info.
          Businesses:
          ${needsContact.map(b => `- ${b.name} at ${b.address}`).join('\n')}

          Return ONLY a JSON array: [{"name": "Business Name", "phone": "phone number or empty", "email": "email or empty"}]`;

          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: {
              tools: [{ googleSearch: {} }],
              responseMimeType: "application/json",
            },
          });

          const contactData = JSON.parse(response.text.trim());

          // Merge back
          contactData.forEach((c: any) => {
            const target = enrichedBusinesses.find(b => b.name === c.name);
            if (target) {
              if (c.phone && !target.phone) target.phone = c.phone;
              if (c.email && target.webData.emails.length === 0) target.webData.emails.push(c.email);
            }
          });
          updateMessageStatus(msgHunter, `Contact hunt complete.`, 'done', `Found additional contact info for ${contactData.filter((c:any) => c.phone || c.email).length} businesses.`);
        } catch (e) {
          updateMessageStatus(msgHunter, `Contact hunt encountered an error.`, 'error', 'Skipping deep contact search.');
        }
      } else {
        updateMessageStatus(msgHunter, `No deep search needed.`, 'done', `All top leads already have contact info.`);
      }

      // 6. Data Verification
      const msg6 = addMessage('DataVerification', 'Verifying data integrity and assigning confidence...', 'thinking');
      const verifiedBusinesses = enrichedBusinesses.map((biz: any) => {
        let confidence = 50;
        if (biz.name !== 'Unknown') confidence += 10;
        if (biz.address !== 'Unknown Address') confidence += 10;
        if (biz.phone || biz.webData.emails.length > 0 || biz.email) confidence += 15;
        if (biz.webData.isReachable) confidence += 15;
        if (biz.sources.length > 1) confidence += 10; // Found in multiple places
        
        return {
          ...biz,
          confidence: Math.min(confidence, 100),
        };
      });
      updateMessageStatus(msg6, 'Verification complete.', 'done', `Average confidence score: ${Math.round(verifiedBusinesses.reduce((acc, b) => acc + b.confidence, 0) / verifiedBusinesses.length)}%`);

      // 7. Lead Scoring & Report
      const msg7 = addMessage('LeadScoring', 'Using Gemini AI to calculate Tech Need Scores...', 'thinking');
      
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY is not configured.");
      }
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const prompt = `
        You are an expert lead scorer for a tech agency. Analyze these small businesses and score their "Tech Need" from 0 to 100.
        A high score (80-100) means they desperately need tech services (website, SEO, digital presence).
        
        Scoring Factors:
        - No website -> +40
        - Broken website -> +30
        - No phone/email -> +15
        - No SEO/meta -> +10
        - No social presence -> +5
        
        Input Data:
        ${JSON.stringify(verifiedBusinesses.map((b:any) => ({ 
          id: b.id, 
          name: b.name, 
          hasWebsite: b.webData.hasWebsite, 
          isBroken: b.webData.isBroken, 
          hasContact: b.webData.hasContactInfo || !!b.phone || !!b.email,
          hasSEO: b.webData.hasSEO,
          hasSocial: b.webData.socialLinks.length > 0
        })))}
        
        Output JSON format EXACTLY like this (no markdown, just raw JSON array):
        [
          { "id": "123", "techNeedScore": 85, "notes": "No website found, prime candidate for digital presence." }
        ]
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        }
      });

      let aiScores: any[] = [];
      try {
        const text = response.text || '[]';
        const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) {
          aiScores = parsed;
        } else if (parsed && typeof parsed === 'object') {
          aiScores = parsed.scores || parsed.leads || [parsed];
        }
        if (!Array.isArray(aiScores)) aiScores = [];
      } catch (e) {
        console.error("Failed to parse Gemini response", response.text);
      }
      
      const finalLeads: BusinessLead[] = verifiedBusinesses.map((biz: any) => {
        const aiData = aiScores.find((a: any) => a.id === biz.id) || { techNeedScore: 50, notes: 'Unable to score.' };
        return {
          id: biz.id,
          name: biz.name,
          category: biz.category,
          address: biz.address,
          lat: biz.lat,
          lng: biz.lng,
          phone: biz.phone,
          website: biz.website,
          email: biz.webData.emails[0] || biz.email || '',
          socialLinks: biz.webData.socialLinks,
          hasSEO: biz.webData.hasSEO,
          isBroken: biz.webData.isBroken,
          techNeedScore: aiData.techNeedScore,
          confidence: biz.confidence,
          sources: biz.sources,
          notes: aiData.notes,
          hasContact: !!(biz.phone || biz.webData.emails[0] || biz.email)
        };
      });

      // Default sort by score descending
      finalLeads.sort((a, b) => b.techNeedScore - a.techNeedScore);

      setLeads(finalLeads);
      updateMessageStatus(msg7, `Pipeline complete. Generated ${finalLeads.length} high-quality leads.`, 'done', `Ready for export and outreach.`);

      // Animate table rows
      setTimeout(() => {
        gsap.fromTo(".lead-row", 
          { opacity: 0, y: 20 }, 
          { opacity: 1, y: 0, stagger: 0.02, duration: 0.4, ease: "power2.out" }
        );
      }, 100);

    } catch (error: any) {
      addMessage('MapCoordinator', `Pipeline failed: ${error.message}`, 'error');
    } finally {
      setIsRunning(false);
    }
  };

  // Table Logic
  const handleSort = (key: keyof BusinessLead) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredAndSortedLeads = useMemo(() => {
    let filtered = leads.filter(lead => 
      lead.name.toLowerCase().includes(filterText.toLowerCase()) ||
      lead.category.toLowerCase().includes(filterText.toLowerCase()) ||
      lead.address.toLowerCase().includes(filterText.toLowerCase())
    );

    filtered.sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
      if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [leads, filterText, sortConfig]);

  const paginatedLeads = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return filteredAndSortedLeads.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredAndSortedLeads, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(filteredAndSortedLeads.length / rowsPerPage);

  const exportCSV = () => {
    if (leads.length === 0) return;
    const headers = ['Name', 'Category', 'Address', 'Phone', 'Email', 'Website', 'Tech Need Score', 'Confidence', 'Notes', 'Sources'];
    const csvContent = [
      headers.join(','),
      ...leads.map(l => [
        `"${(l.name || '').replace(/"/g, '""')}"`,
        `"${l.category || ''}"`,
        `"${(l.address || '').replace(/"/g, '""')}"`,
        `"${l.phone || ''}"`,
        `"${l.email || ''}"`,
        `"${l.website || ''}"`,
        l.techNeedScore || 0,
        l.confidence || 0,
        `"${(l.notes || '').replace(/"/g, '""')}"`,
        `"${(l.sources || []).join(' | ')}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `business-leads-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const SortIcon = ({ columnKey }: { columnKey: keyof BusinessLead }) => {
    if (sortConfig.key !== columnKey) return <ChevronDown className="w-3 h-3 opacity-20" />;
    return sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-[#00f3ff]" /> : <ChevronDown className="w-3 h-3 text-[#00f3ff]" />;
  };

  return (
    <div className="min-h-screen bg-[#050508] text-gray-300 font-sans selection:bg-[#00f3ff]/30 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b border-white/10 bg-white/5 backdrop-blur-md flex items-center justify-between px-6 z-20 relative">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-8 h-8 rounded bg-[#00f3ff]/10 border border-[#00f3ff]/30">
            <Target className="w-5 h-5 text-[#00f3ff]" />
            <div className="absolute inset-0 bg-[#00f3ff] blur-md opacity-20"></div>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">BusinessForge <span className="text-[#00f3ff]">AI</span></h1>
        </div>
        
        <form onSubmit={handleSearch} className="flex items-center relative max-w-md w-full">
          <Search className="w-4 h-4 absolute left-3 text-gray-500" />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search city (e.g., Brooklyn, NY)"
            className="w-full bg-black/50 border border-white/10 rounded-full py-1.5 pl-9 pr-4 text-sm focus:outline-none focus:border-[#00f3ff]/50 focus:ring-1 focus:ring-[#00f3ff]/50 transition-all text-white placeholder-gray-600"
          />
        </form>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all text-gray-400 hover:text-white"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button 
            onClick={exportCSV}
            disabled={leads.length === 0}
            className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: AI Agents */}
        <aside className="w-80 border-r border-white/10 bg-black/40 backdrop-blur-xl flex flex-col relative z-10">
          <div className="p-4 border-b border-white/10">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-3 h-3 text-[#ffb300]" />
              Agent Swarm Activity
            </h2>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar" ref={chatContainerRef}>
            {messages.length === 0 && !isRunning && (
              <div className="text-center text-gray-600 text-sm mt-10">
                <MapPin className="w-8 h-8 mx-auto mb-3 opacity-20" />
                <p>Click anywhere on the map or search a city to deploy the agent swarm.</p>
              </div>
            )}
            
            {messages.map((msg) => {
              const config = AGENT_CONFIG[msg.role];
              const Icon = config.icon;
              return (
                <div key={msg.id} id={`msg-${msg.id}`} className="flex gap-3">
                  <div className={`mt-1 flex-shrink-0 w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center ${config.color}`}>
                    <Icon className="w-3 h-3" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-medium ${config.color}`}>{config.name}</span>
                      {msg.status === 'thinking' && <Loader2 className="w-3 h-3 animate-spin text-gray-500" />}
                      {msg.status === 'done' && <CheckCircle2 className="w-3 h-3 text-[#00ff66]" />}
                      {msg.status === 'error' && <AlertTriangle className="w-3 h-3 text-[#ff003c]" />}
                    </div>
                    <div className="text-sm text-gray-300 leading-relaxed bg-white/5 border border-white/5 rounded-lg p-2.5">
                      {msg.content}
                      {msg.details && (
                        <div className="mt-2 pt-2 border-t border-white/10 text-xs text-gray-500 flex items-start gap-1.5">
                          <ArrowRight className="w-3 h-3 mt-0.5 flex-shrink-0" />
                          <span>{msg.details}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col relative">
          {/* Map Area (Top Half) */}
          <div className="h-[40%] relative border-b border-white/10">
            <MapContainer 
              center={mapCenter} 
              zoom={13} 
              className="w-full h-full bg-[#0a0a0f]"
              zoomControl={false}
            >
              <MapUpdater center={mapCenter} />
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              />
              <MapEvents onLocationSelect={handleLocationSelect} />
              
              {selectedLocation && (
                <Marker position={selectedLocation} icon={cyberIcon}>
                  <Popup className="cyber-popup">Target Location</Popup>
                </Marker>
              )}
              
              {leads.filter(l => l.lat && l.lng).map(lead => (
                <Marker key={lead.id} position={[lead.lat, lead.lng]} icon={cyberIcon}>
                  <Popup className="cyber-popup">
                    <div className="font-bold text-[#00f3ff]">{lead.name}</div>
                    <div className="text-xs text-gray-400">{lead.category}</div>
                    <div className="mt-1 text-xs">Score: <span className="text-[#ffb300]">{lead.techNeedScore}</span></div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
            
            {/* Map Overlay HUD */}
            <div className="absolute top-4 left-4 z-[400] pointer-events-none">
              <div className="bg-black/60 backdrop-blur-md border border-[#00f3ff]/30 rounded-lg p-3 shadow-[0_0_15px_rgba(0,243,255,0.1)]">
                <div className="text-[10px] text-[#00f3ff] uppercase tracking-widest mb-1">System Status</div>
                <div className="text-sm font-mono text-white flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-[#ff003c] animate-pulse' : 'bg-[#00ff66]'}`}></span>
                  {isRunning ? 'SWARM ACTIVE' : 'AWAITING TARGET'}
                </div>
              </div>
            </div>
          </div>

          {/* Data Table Area (Bottom Half) */}
          <div className="h-[60%] bg-[#050508] flex flex-col relative">
            {/* Table Toolbar */}
            <div className="p-3 border-b border-white/10 flex items-center justify-between bg-white/5">
              <div className="flex items-center gap-4">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-[#00f3ff]" />
                  Verified Leads ({filteredAndSortedLeads.length})
                </h2>
                <div className="relative">
                  <Filter className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input 
                    type="text" 
                    value={filterText}
                    onChange={(e) => { setFilterText(e.target.value); setCurrentPage(1); }}
                    placeholder="Filter results..."
                    className="bg-black/50 border border-white/10 rounded px-8 py-1 text-xs focus:outline-none focus:border-[#00f3ff]/50 text-white w-64"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>Rows per page:</span>
                <select 
                  value={rowsPerPage} 
                  onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                  className="bg-black/50 border border-white/10 rounded px-2 py-1 focus:outline-none text-white"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
            
            {/* Table */}
            <div className="flex-1 overflow-auto custom-scrollbar">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="sticky top-0 bg-[#0a0a0f] border-b border-white/10 z-10 text-xs uppercase text-gray-500 font-semibold">
                  <tr>
                    <th className="px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors" onClick={() => handleSort('techNeedScore')}>
                      <div className="flex items-center gap-1">Score <SortIcon columnKey="techNeedScore" /></div>
                    </th>
                    <th className="px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors" onClick={() => handleSort('name')}>
                      <div className="flex items-center gap-1">Business Name <SortIcon columnKey="name" /></div>
                    </th>
                    <th className="px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors" onClick={() => handleSort('category')}>
                      <div className="flex items-center gap-1">Category <SortIcon columnKey="category" /></div>
                    </th>
                    <th className="px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors" onClick={() => handleSort('hasContact')}>
                      <div className="flex items-center gap-1">Contact & Web <SortIcon columnKey="hasContact" /></div>
                    </th>
                    <th className="px-4 py-3">AI Analysis</th>
                    <th className="px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors" onClick={() => handleSort('confidence')}>
                      <div className="flex items-center gap-1">Confidence <SortIcon columnKey="confidence" /></div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {paginatedLeads.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-600">
                        {isRunning ? 'Processing data stream...' : 'No data available.'}
                      </td>
                    </tr>
                  ) : (
                    paginatedLeads.map(lead => (
                      <tr key={lead.id} onClick={() => setSelectedLead(lead)} className={`lead-row cursor-pointer hover:bg-white/5 transition-colors group ${lead.techNeedScore >= 80 ? 'bg-[#ff003c]/5' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs border ${
                              lead.techNeedScore >= 80 ? 'bg-[#ff003c]/10 border-[#ff003c]/50 text-[#ff003c] shadow-[0_0_10px_rgba(255,0,60,0.2)]' :
                              lead.techNeedScore >= 50 ? 'bg-[#ffb300]/10 border-[#ffb300]/50 text-[#ffb300]' :
                              'bg-[#00ff66]/10 border-[#00ff66]/50 text-[#00ff66]'
                            }`}>
                              {lead.techNeedScore}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-white">{lead.name}</div>
                          <div className="text-xs text-gray-500 truncate max-w-[200px]">{lead.address}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-400 capitalize">{lead.category.replace('_', ' ')}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-0.5">
                            {lead.phone && <div className="text-xs text-gray-300">{lead.phone}</div>}
                            {lead.email && <div className="text-xs text-[#00f3ff]">{lead.email}</div>}
                            {!lead.phone && !lead.email && <div className="text-xs text-gray-600 italic">No direct contact</div>}
                            
                            <div className="text-xs mt-1">
                              {lead.website ? (
                                <div className="flex items-center gap-2">
                                  <a href={lead.website} target="_blank" rel="noreferrer" className="text-[#00f3ff] hover:underline truncate max-w-[150px]">Website</a>
                                  {lead.isBroken && <span className="text-[10px] bg-[#ff003c]/20 text-[#ff003c] px-1.5 rounded border border-[#ff003c]/30">Broken</span>}
                                  {!lead.hasSEO && <span className="text-[10px] bg-[#ffb300]/20 text-[#ffb300] px-1.5 rounded border border-[#ffb300]/30">No SEO</span>}
                                </div>
                              ) : (
                                <span className="text-[#ff003c] italic">No website</span>
                              )}
                            </div>
                            {lead.socialLinks.length > 0 && (
                              <div className="text-[10px] text-gray-500 mt-0.5">
                                {lead.socialLinks.length} social link(s) found
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs text-gray-300 truncate max-w-[300px] whitespace-normal line-clamp-2" title={lead.notes}>
                            {lead.notes}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-full bg-black/50 rounded-full h-1.5 max-w-[60px]">
                              <div className="bg-[#b026ff] h-1.5 rounded-full" style={{ width: `${lead.confidence}%` }}></div>
                            </div>
                            <span className="text-xs text-gray-400">{lead.confidence}%</span>
                          </div>
                          <div className="text-[10px] text-gray-500 mt-1">
                            {lead.sources.length} source(s)
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="p-3 border-t border-white/10 bg-white/5 flex items-center justify-between text-xs text-gray-400">
              <div>
                Showing {paginatedLeads.length > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0} to {Math.min(currentPage * rowsPerPage, filteredAndSortedLeads.length)} of {filteredAndSortedLeads.length} entries
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2 py-1 rounded bg-black/50 border border-white/10 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Prev
                </button>
                <span className="px-2">Page {currentPage} of {totalPages || 1}</span>
                <button 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="px-2 py-1 rounded bg-black/50 border border-white/10 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Lead Details Slide-over */}
      {selectedLead && (
        <div className="fixed inset-0 z-[500] flex justify-end bg-black/50 backdrop-blur-sm" onClick={() => setSelectedLead(null)}>
          <div 
            className="w-full max-w-md h-full bg-[#0a0a0f] border-l border-white/10 shadow-2xl flex flex-col transform transition-transform duration-300"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5">
              <h2 className="text-xl font-bold text-white pr-4">{selectedLead.name}</h2>
              <button onClick={() => setSelectedLead(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors shrink-0">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {/* Score & Confidence */}
              <div className="flex gap-4">
                <div className="flex-1 bg-white/5 border border-white/10 rounded-lg p-4 text-center">
                  <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Tech Need Score</div>
                  <div className={`text-3xl font-bold ${selectedLead.techNeedScore >= 80 ? 'text-[#ff003c]' : selectedLead.techNeedScore >= 50 ? 'text-[#ffb300]' : 'text-[#00ff66]'}`}>
                    {selectedLead.techNeedScore}
                  </div>
                </div>
                <div className="flex-1 bg-white/5 border border-white/10 rounded-lg p-4 text-center">
                  <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Confidence</div>
                  <div className="text-3xl font-bold text-[#b026ff]">{selectedLead.confidence}%</div>
                </div>
              </div>
              
              {/* Contact Info */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-[#00f3ff] uppercase tracking-wider border-b border-white/10 pb-2">Contact Information</h3>
                <div className="grid grid-cols-1 gap-3 text-sm">
                  <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                    <span className="text-gray-300">{selectedLead.address}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-gray-500 shrink-0" />
                    <span className="text-gray-300">{selectedLead.phone || 'No phone available'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-gray-500 shrink-0" />
                    <span className="text-gray-300">{selectedLead.email || 'No email available'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Globe className="w-4 h-4 text-gray-500 shrink-0" />
                    {selectedLead.website ? (
                      <a href={selectedLead.website} target="_blank" rel="noreferrer" className="text-[#00f3ff] hover:underline break-all">{selectedLead.website}</a>
                    ) : (
                      <span className="text-gray-500 italic">No website</span>
                    )}
                  </div>
                </div>
              </div>

              {/* AI Notes */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-[#ffb300] uppercase tracking-wider border-b border-white/10 pb-2">AI Analysis</h3>
                <p className="text-sm text-gray-300 leading-relaxed bg-white/5 p-4 rounded-lg border border-white/5">
                  {selectedLead.notes}
                </p>
              </div>

              {/* Web Presence */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-[#00ff66] uppercase tracking-wider border-b border-white/10 pb-2">Web Presence</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedLead.website && !selectedLead.isBroken && <span className="px-2 py-1 bg-[#00ff66]/10 text-[#00ff66] border border-[#00ff66]/30 rounded text-xs">Website Active</span>}
                  {selectedLead.isBroken && <span className="px-2 py-1 bg-[#ff003c]/10 text-[#ff003c] border border-[#ff003c]/30 rounded text-xs">Website Broken</span>}
                  {selectedLead.hasSEO ? <span className="px-2 py-1 bg-[#00ff66]/10 text-[#00ff66] border border-[#00ff66]/30 rounded text-xs">SEO Found</span> : <span className="px-2 py-1 bg-[#ffb300]/10 text-[#ffb300] border border-[#ffb300]/30 rounded text-xs">Missing SEO</span>}
                </div>
                {selectedLead.socialLinks.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs text-gray-500 mb-2">Social Links:</div>
                    <div className="flex flex-col gap-1">
                      {selectedLead.socialLinks.map((link, i) => (
                        <a key={i} href={link} target="_blank" rel="noreferrer" className="text-xs text-[#00f3ff] hover:underline truncate">{link}</a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Sources */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider border-b border-white/10 pb-2">Data Sources</h3>
                <ul className="list-disc list-inside text-xs text-gray-500 space-y-1">
                  {selectedLead.sources.map((source, i) => (
                    <li key={i} className="truncate">
                      {source.startsWith('http') ? <a href={source} target="_blank" rel="noreferrer" className="hover:text-gray-300 hover:underline">{source}</a> : source}
                    </li>
                  ))}
                </ul>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setIsSettingsOpen(false)}>
          <div 
            className="w-full max-w-md bg-[#0a0a0f] border border-white/10 rounded-xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-[#00f3ff]" />
                Data Source Settings
              </h2>
              <button onClick={() => setIsSettingsOpen(false)} className="p-1 hover:bg-white/10 rounded-full transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Search Radius: {searchRadius / 1000}km</label>
                <p className="text-xs text-gray-500 mb-3">
                  Larger areas return more leads but take longer to process. We cap results to ensure the AI can analyze every website without timing out.
                </p>
                <input 
                  type="range" 
                  min="1000" 
                  max="20000" 
                  step="1000"
                  value={searchRadius}
                  onChange={(e) => setSearchRadius(parseInt(e.target.value))}
                  className="w-full accent-[#00f3ff]"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>1km</span>
                  <span>10km</span>
                  <span>20km</span>
                </div>
              </div>

              <div className="border-t border-white/10 pt-4">
                <label className="block text-sm font-medium text-gray-300 mb-1">Google Places API Key (Optional)</label>
                <p className="text-xs text-gray-500 mb-3">
                  Provide a Google Places API key to use premium, highly accurate business data instead of free OpenStreetMap data. 
                  This drastically improves results in dense cities.
                </p>
                <input 
                  type="password" 
                  value={googlePlacesKey}
                  onChange={(e) => setGooglePlacesKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full bg-black/50 border border-white/10 rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-[#00f3ff]/50 focus:ring-1 focus:ring-[#00f3ff]/50 transition-all text-white placeholder-gray-600"
                />
              </div>
            </div>

            <div className="p-4 border-t border-white/10 bg-black/20 flex justify-end gap-3">
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={saveSettings}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-[#00f3ff]/10 text-[#00f3ff] border border-[#00f3ff]/30 hover:bg-[#00f3ff]/20 transition-colors"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        
        /* Cyberpunk Leaflet Popup overrides */
        .leaflet-popup-content-wrapper {
          background: rgba(10, 10, 15, 0.9) !important;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(0, 243, 255, 0.3);
          border-radius: 8px !important;
          color: white !important;
          box-shadow: 0 0 20px rgba(0, 243, 255, 0.1) !important;
        }
        .leaflet-popup-tip {
          background: rgba(10, 10, 15, 0.9) !important;
          border-top: 1px solid rgba(0, 243, 255, 0.3);
          border-left: 1px solid rgba(0, 243, 255, 0.3);
        }
        .leaflet-container a.leaflet-popup-close-button {
          color: #00f3ff !important;
        }
      `}} />
    </div>
  );
}
