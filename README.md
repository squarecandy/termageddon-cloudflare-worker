# Cloudflare Worker for Termageddon Geolocation

This Cloudflare Worker sets the `tu-geoip-hide` cookie based on visitor geolocation to prevent unnecessary admin-ajax calls on every page load.

## How It Works

1. **First visit**: Worker detects no cookie → Sets `tu-geoip-hide` cookie based on location
2. **Subsequent visits**: Cookie exists → Worker does nothing, plugin uses cached value

## Deployment Steps

### 1. Create the Worker in Cloudflare

1. Log in to your [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Go to **Workers & Pages**
3. Click **Create application** → **Create Worker**
4. Click **Start with Hello World**
5. Give it a name like `termageddon-geolocation` (or use the auto-generated name)
6. Click **Deploy** (this deploys the default "Hello World" worker)
7. After deployment, click **Edit Code** (top right)
8. In the code editor, select all the default code and delete it
9. Copy and paste the entire contents of `cloudflare-worker.js` into the editor
10. Edit the values at the top to match your site's show/hide settings. You can come back here and edit these anytime. Note that the plugin's toggles will NOT update these anymore. You need to set them here if you're going to use this cloud
11. Click **Save and Deploy**

### 2. Add Worker Route

1. In Cloudflare Dashboard, go to **Websites** → Select your domain
1. Go to **Workers Routes**
1. Click **Add Route**
1. **Route**: `example.com/*` (or `*.example.com/*` for all subdomains)
1. **Worker**: Select the worker you created above
1. Be sure to select fail mode **Fail open (proceed)** - this will allow the system to fall back to the normal server-size admin-ajax system if you hit your 100k daily limit
1. Click **Save**

**Performance note:** 
- The worker checks URL extensions and skips static files before fetching from origin, saving bandwidth
- However, all matching requests still count toward your 100,000/day worker invocation quota
- For most sites, this is more than sufficient
- If needed, you can add multiple specific routes (e.g., `example.com/` with no trailing wildcard, `example.com/article/*`, `example.com/product/*`) instead of `/*` to reduce invocations further

### 3. WordPress Plugin Settings
- Geolocation (top toggle) `ON`
- Note that the region selection toggles no longer do anything unless Cloudflare is bypassed! You must set these the way you need these here and then repeat that exactly in the configuration at the top of `cloudflare-worker.js`
- Enable Location Logging must be `OFF`. If it is on, admin-ajax will always fire for debugging reasons.
- Enable page caching support via AJAX must be `ON`. This is needed as a fallback and for the existing cookie check to work as expected.

### 4. Test the Worker

Visit your site in an incognito/private window:

1. Open Developer Tools → **Network** tab
1. Load a page and check the response headers. Look for: `Set-Cookie: tu-geoip-hide=true` (or `false`)
1. You should NOT see any calls to admin-ajax with payload `uc_geolocation_lookup`
1. Open Developer Tools → **Application** tab  → Cookies  → https://example.com
1. You should see the `tu-geoip=hide` cookie with the correct true/false value.

#### Debug Mode

On staging/development environments (domains containing `staging.`, `stg.`, `.local`, or `.localhost`), the worker automatically adds debug headers:

- `X-TU-Location`: Shows detected location (e.g., `US-CA-San Francisco`)
- `X-TU-Hide`: Shows if consent banner is hidden (`true` or `false`)

#### Testing Different Locations

Test different locations using the `?termageddon-usercentrics-debug` parameter:

```
https://staging.example.com/?termageddon-usercentrics-debug=california
https://staging.example.com/?termageddon-usercentrics-debug=eu
https://staging.example.com/?termageddon-usercentrics-debug=canada
```

**Available test locations:**

`california`, `colorado`, `connecticut`, `delaware`, `florida`, `indiana`, `montana`, `oregon`, `texas`, `utah`, `virginia`, `newyork`, `eu`, `uk`, `canada`

When using the debug parameter:

- An additional `X-TU-Debug-Location` header shows which test location is active
- Debug headers are enabled regardless of domain
- The cookie is set based on the test location instead of actual geolocation

Debug headers are automatically disabled in production. They only appear when:

- Domain contains `staging.`, `stg.`, `.local`, or `.localhost`, OR
- URL includes `?termageddon-usercentrics-debug` parameter

## Customizing Location Logic

Edit the `SHOW_CONSENT_BANNER_IN` configuration at the top of the worker to customize which locations should show/hide the consent banner:

## Cookie Details

- **Name**: `tu-geoip-hide`
- **Value**: `"true"` (hide) or `"false"` (show)
- **Expiration**: Session (until browser closes)
- **Path**: `/`
- **SameSite**: `Lax`
- **Secure**: Yes (HTTPS only)

## Performance Impact

- **Before**: 1000s of unique visitors = 1000s of admin-ajax calls = high server load
- **After**: 1000s of unique visitors = 1000s of fully cached responses = minimal impact
- **Worker overhead**: <1ms per request

## Notes

- Basic geolocation (`country` and `region`/state) is available on all Cloudflare plans including Free.
- Workers are available on all Cloudflare plans (Free, Pro, Business, Enterprise)
- Free and Pro plans includes 100,000 requests/day
- This worker adds ~0.5-1ms latency per request
- No changes needed to the WordPress plugin code
