/**
 * Cloudflare Worker for Termageddon Geolocation Cookie
 * 
 * This worker sets the tu-geoip-hide cookie based on visitor location
 * to prevent unnecessary admin-ajax calls for geolocation lookups.
 * 
 * Deploy this to your Cloudflare Workers and route it to your domain.
 */

// ============================================================================
// CONFIGURATION - Set to true to SHOW the consent banner in each location
// ============================================================================

const SHOW_CONSENT_BANNER_IN = {
  // European Union & European Economic Area (GDPR)
  'EU': true,
  
  // United Kingdom (UK DPA)
  'GB': true,
  
  // Canada (PIPEDA, Quebec 25)
  'CA': false,

  // Add other countries as needed, e.g.:
  // 'AU': false // Australia (Privacy Act)
  // 'CH': false // Switzerland (FADP)
  // 'JP': false // Japan (APPI)
  
  // United States
  'US-CA': true,   // California (CPRA, CIPA)
  'US-CO': false,  // Colorado (CPA)
  'US-CT': false,  // Connecticut (CTDPA)
  'US-DE': false,  // Delaware (DPDPA)
  'US-FL': false,  // Florida (FDBR)
  'US-IN': false,  // Indiana (ICDPA)
  'US-MT': false,  // Montana (MCDPA)
  'US-OR': false,  // Oregon (OCPA)
  'US-TX': false,  // Texas (TDPSA)
  'US-UT': false,  // Utah (UCPA)
  'US-VA': false,  // Virginia (VCDPA)

  // Add other US states as needed, e.g.: 'US-NJ': false, // New Jersey (NJDPA)
}

// EU/EEA country codes (GDPR)
const EU_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO'
]

// Debug location mappings (for ?termageddon-usercentrics-debug parameter)
const DEBUG_LOCATIONS = {
  'california': { country: 'US', region: 'CA' },
  'colorado': { country: 'US', region: 'CO' },
  'connecticut': { country: 'US', region: 'CT' },
  'delaware': { country: 'US', region: 'DE' },
  'florida': { country: 'US', region: 'FL' },
  'indiana': { country: 'US', region: 'IN' },
  'montana': { country: 'US', region: 'MT' },
  'oregon': { country: 'US', region: 'OR' },
  'texas': { country: 'US', region: 'TX' },
  'utah': { country: 'US', region: 'UT' },
  'virginia': { country: 'US', region: 'VA' },
  'newyork': { country: 'US', region: 'NY' },
  'eu': { country: 'DE', region: '' },
  'uk': { country: 'GB', region: '' },
  'canada': { country: 'CA', region: '' },
}

// ============================================================================

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  // Parse URL early to check for static assets
  const url = new URL(request.url)
  const pathname = url.pathname.toLowerCase()
  
  // Skip common static file extensions before fetching from origin
  // This saves bandwidth even though it still counts as a worker invocation
  const staticExtensions = ['.css', '.js', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.ico', '.webp', '.mp4', '.pdf', '.zip']
  if (staticExtensions.some(ext => pathname.endsWith(ext))) {
    return fetch(request)
  }
  
  // Get the original response
  const response = await fetch(request)
  
  // Only process HTML documents - skip CSS, JS, images, fonts, etc.
  const contentType = response.headers.get('Content-Type') || ''
  if (!contentType.includes('text/html')) {
    return response
  }
  
  // Parse URL for debug parameter
  const debugLocation = url.searchParams.get('termageddon-usercentrics-debug')
  
  // Determine if we should enable debug mode
  const hostname = url.hostname.toLowerCase()
  const isDebugEnvironment = 
    hostname.includes('staging.') || 
    hostname.includes('stg.') || 
    hostname.includes('.local') || 
    hostname.includes('.localhost') ||
    debugLocation !== null
  
  // Check if the cookie is already set
  const cookies = request.headers.get('Cookie') || ''
  const hasCookie = cookies.includes('tu-geoip-hide=')
  
  // If cookie already exists, just return the original response
  if (hasCookie) {
    return response
  }
  
  // Get geolocation data from Cloudflare or debug override
  let country, region
  
  if (debugLocation && DEBUG_LOCATIONS[debugLocation.toLowerCase()]) {
    // Use debug location
    const debugData = DEBUG_LOCATIONS[debugLocation.toLowerCase()]
    country = debugData.country
    region = debugData.region
  } else {
    // Use actual Cloudflare geolocation
    country = request.cf?.country || 'US'
    region = request.cf?.region || ''
  }
  
  // Determine if we should hide the consent banner
  const shouldHide = shouldHideConsentBanner(country, region)
  
  // Create new response with cookie
  const newResponse = new Response(response.body, response)
  
  // Set the cookie
  // Using session cookie (no Max-Age) so it persists until browser closes
  newResponse.headers.append(
    'Set-Cookie',
    `tu-geoip-hide=${shouldHide}; Path=/; SameSite=Lax; Secure`
  )
  
  // Add debug headers only in debug environments
  if (isDebugEnvironment) {
    newResponse.headers.set('X-TU-Location', region ? `${country}-${region}` : country)
    newResponse.headers.set('X-TU-Hide', shouldHide)
    if (debugLocation) {
      newResponse.headers.set('X-TU-Debug-Location', debugLocation)
    }
  }
  
  return newResponse
}

/**
 * Determine if consent banner should be hidden based on location
 * 
 * Performance optimized: fastest checks first (most common cases)
 * 
 * @param {string} country - ISO country code (e.g., 'US', 'GB', 'FR')
 * @param {string} region - State/region code (e.g., 'CA', 'VA', 'CO')
 * @returns {string} - 'true' to hide banner, 'false' to show it
 */
function shouldHideConsentBanner(country, region) {
  let hideConsentBanner = true  // Default: hide banner
  
  // Check US visitors
  if (country === 'US' && region) {
    const usKey = `US-${region}`
    hideConsentBanner = !(SHOW_CONSENT_BANNER_IN[usKey] || false)
  }
  // Check if EU country
  else if (EU_COUNTRIES.includes(country)) {
    hideConsentBanner = !(SHOW_CONSENT_BANNER_IN['EU'] || false)
  }
  // Check individual countries
  else if (country in SHOW_CONSENT_BANNER_IN) {
    hideConsentBanner = !SHOW_CONSENT_BANNER_IN[country]
  }
  
  // Return 'true' to hide banner, 'false' to show it
  return hideConsentBanner ? 'true' : 'false'
}
