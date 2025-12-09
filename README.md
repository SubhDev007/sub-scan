# Event QR Ticket Scanner

A fast, mobile-optimized React app for scanning QR tickets at events. Built for high-volume crowd scanning with continuous, non-stop operation.

## Features

- ⚡ **Ultra-fast scanning** - 30 FPS with html5-qrcode library
- 📱 **Mobile-optimized** - Works perfectly on phones and tablets
- 🔄 **Continuous scanning** - Auto-resets after each scan, no manual intervention needed
- 🚫 **Debouncing** - Prevents duplicate scans of the same ticket
- 📷 **Back camera default** - Better accuracy and low-light performance
- 🎨 **Modern UI** - Beautiful, responsive design with real-time status indicators
- 📊 **Scan history** - Shows last 10 scanned tickets

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```

3. **Open in browser:**
   - The app will be available at `http://localhost:3000`
   - **Important for Android Chrome:** Camera requires HTTPS (except localhost)
   - For mobile testing on same device: Use `localhost:3000` or `127.0.0.1:3000`
   - For mobile testing on network: 
     - Option 1: Enable HTTPS in `vite.config.js` (uncomment `https: true`)
     - Option 2: Use tunneling service: `npx localtunnel --port 3000`
     - Option 3: Use `http://YOUR_IP:3000` but camera may be blocked

4. **Build for production:**
   ```bash
   npm run build
   ```

## Usage

1. **Grant camera permissions** when prompted
2. **Point camera at QR code** - The scanner will automatically detect and decode
3. **View results** - Scanned data appears instantly and auto-clears after 1.5 seconds
4. **Continuous operation** - Just move to the next ticket, no buttons needed!

## Performance Optimizations

- ✅ 30 FPS scanning rate
- ✅ 2-second debounce to prevent duplicate scans
- ✅ Auto-reset after each scan
- ✅ Back camera for better performance
- ✅ Optimized video constraints (1280x720 ideal)
- ✅ Minimal UI updates for faster rendering

## Tech Stack

- **React 18** - UI framework
- **Vite** - Fast build tool
- **html5-qrcode** - Fastest QR scanning library (WebAssembly optimized)

## Mobile Testing

### Android Chrome Camera Permission Issue

**Important:** Android Chrome requires HTTPS for camera access (except localhost). If you see "permission masked" or camera blocked in site settings:

**Solution 1: Use localhost (Recommended for testing)**
- On your phone, access `http://localhost:3000` or `http://127.0.0.1:3000`
- Works if running on the same device, or use port forwarding

**Solution 2: Enable HTTPS in Vite**
1. Uncomment `https: true` in `vite.config.js`
2. Restart dev server: `npm run dev`
3. Accept the self-signed certificate warning in browser
4. Access via `https://YOUR_IP:3000` on your phone

**Solution 3: Use Tunneling Service**
```bash
npx localtunnel --port 3000
# or
npx ngrok http 3000
```
Then use the provided HTTPS URL on your phone

**Solution 4: Manual Chrome Settings (May not work)**
- Chrome Settings → Site Settings → Camera → Allow for your site
- Note: Chrome may still block camera on HTTP sites

### Testing Steps
1. Make sure your phone and computer are on the same WiFi network
2. Find your computer's IP address
3. Access the app using one of the methods above
4. Grant camera permissions when prompted

## Future Features

- Backend API integration for ticket validation
- Sound/vibration feedback on successful scans
- Statistics dashboard
- Export scan history
- Multi-event support
