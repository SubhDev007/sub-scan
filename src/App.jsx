import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import './App.css'

function App() {
  const [isScanning, setIsScanning] = useState(false)
  const [scannedData, setScannedData] = useState(null)
  const [scanHistory, setScanHistory] = useState([])
  const [error, setError] = useState(null)
  const [isInitializing, setIsInitializing] = useState(false)
  const [permissionStatus, setPermissionStatus] = useState('prompt') // 'prompt', 'granted', 'denied'
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(true)
  const [isSecureContext, setIsSecureContext] = useState(true)
  const scannerRef = useRef(null)
  const html5QrCodeRef = useRef(null)
  const lastScanRef = useRef({ code: null, timestamp: 0 })
  const DEBOUNCE_TIME = 2000 // 2 seconds debounce

  // Calculate responsive QR box size
  const getQrBoxSize = () => {
    const width = window.innerWidth
    const height = window.innerHeight
    const minDimension = Math.min(width, height)
    // Use 80% of screen width, but max 300px and min 200px
    const size = Math.min(Math.max(minDimension * 0.8, 200), 300)
    return { width: size, height: size }
  }

  // Check if we're in a secure context (HTTPS or localhost)
  const checkSecureContext = () => {
    const protocol = window.location.protocol
    const hostname = window.location.hostname
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'
    const isHTTPS = protocol === 'https:'
    const isSecure = isHTTPS || isLocalhost
    
    setIsSecureContext(isSecure)
    return isSecure
  }

  // Request camera permission explicitly (required for Android Chrome)
  const requestCameraPermission = async () => {
    try {
      setError(null)
      setIsInitializing(true)
      setShowPermissionPrompt(false)

      // Check secure context first
      const secure = checkSecureContext()
      if (!secure) {
        const protocol = window.location.protocol
        const hostname = window.location.hostname
        throw new Error(`HTTPS_REQUIRED:${protocol}:${hostname}`)
      }

      // Check if camera is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera not supported. Please use a device with a camera.")
      }

      console.log("Requesting camera permission...")
      
      // Request camera permission explicitly
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: "environment" // Back camera
        } 
      })
      
      // Permission granted - stop the test stream and start scanner
      stream.getTracks().forEach(track => track.stop())
      setPermissionStatus('granted')
      console.log("Camera permission granted")
      
      // Now start the actual scanner
      await startScanner()
      
    } catch (err) {
      console.error("Permission error:", err)
      setIsInitializing(false)
      
      if (err.message && err.message.startsWith('HTTPS_REQUIRED')) {
        const [, protocol, hostname] = err.message.split(':')
        setPermissionStatus('denied')
        setError(`HTTPS_REQUIRED:${hostname}`)
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionStatus('denied')
        setError("Camera permission denied. Please allow camera access in your browser settings and try again.")
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError("No camera found. Please use a device with a camera.")
      } else {
        setError(err.message || "Failed to access camera. Please check permissions.")
      }
    }
  }

  const startScanner = async () => {
    try {
      // Ensure the reader element exists
      const readerElement = document.getElementById("reader")
      if (!readerElement) {
        throw new Error("Scanner container not found. Please refresh the page.")
      }

      const html5QrCode = new Html5Qrcode("reader")
      html5QrCodeRef.current = html5QrCode

      const qrBoxSize = getQrBoxSize()

      // Try with simplified config first (better for mobile)
      const config = {
        fps: 10, // Start with lower FPS for mobile compatibility
        qrbox: qrBoxSize,
        aspectRatio: 1.0,
        disableFlip: false,
        // Remove videoConstraints for better mobile compatibility
      }

      // Try back camera first, fallback to any camera
      let cameraId = { facingMode: "environment" }
      
      console.log("Starting QR scanner with config:", config)
      console.log("Camera ID:", cameraId)
      
      await html5QrCode.start(
        cameraId,
        config,
        (decodedText, decodedResult) => {
          console.log("QR Code detected:", decodedText)
          handleScanSuccess(decodedText, decodedResult)
        },
        (errorMessage) => {
          // Ignore scanning errors, just continue
          // Only log if it's not the common "NotFoundException" which is normal
          if (!errorMessage.includes("NotFoundException")) {
            console.log("Scan error (ignored):", errorMessage)
          }
        }
      )
      
      console.log("QR scanner started successfully")
      setIsScanning(true)
      setIsInitializing(false)
      
      // Verify video element exists after a short delay
      setTimeout(() => {
        const video = document.querySelector("#reader video")
        if (video) {
          console.log("Video element found:", video)
          console.log("Video dimensions:", video.videoWidth, "x", video.videoHeight)
        } else {
          console.warn("Video element not found in #reader")
        }
      }, 1000)
    } catch (err) {
      console.error("Scanner error:", err)
      setError(err.message || "Failed to start camera. Please check permissions.")
      setIsScanning(false)
      setIsInitializing(false)
      
      // If html5QrCode was created, clean it up
      if (html5QrCodeRef.current) {
        try {
          const scanner = html5QrCodeRef.current
          if (scanner && scanner.isScanning && scanner.isScanning()) {
            await scanner.stop()
          }
          await scanner.clear()
        } catch (cleanupErr) {
          console.error("Cleanup error:", cleanupErr)
        }
        html5QrCodeRef.current = null
      }
    }
  }

  const stopScanning = async () => {
    try {
      if (html5QrCodeRef.current) {
        await html5QrCodeRef.current.stop()
        await html5QrCodeRef.current.clear()
        html5QrCodeRef.current = null
      }
      setIsScanning(false)
    } catch (err) {
      console.error("Error stopping scanner:", err)
    }
  }

  const handleScanSuccess = (decodedText, decodedResult) => {
    const now = Date.now()
    const lastScan = lastScanRef.current

    // Debounce: Skip if same code scanned within debounce time
    if (lastScan.code === decodedText && (now - lastScan.timestamp) < DEBOUNCE_TIME) {
      return
    }

    // Update last scan
    lastScanRef.current = { code: decodedText, timestamp: now }

    // Process the scan
    setScannedData({
      text: decodedText,
      timestamp: new Date().toLocaleTimeString(),
      raw: decodedResult
    })

    // Add to history
    setScanHistory(prev => [
      { text: decodedText, timestamp: new Date().toLocaleTimeString() },
      ...prev.slice(0, 9) // Keep last 10 scans
    ])

    // Auto-reset after showing result (for continuous scanning)
    setTimeout(() => {
      // Scanner continues automatically, just clear the displayed result
      setScannedData(null)
    }, 1500) // Show result for 1.5 seconds then clear
  }

  // Check secure context and permission status on mount
  useEffect(() => {
    // Check secure context first
    const secure = checkSecureContext()
    
    const checkPermission = async () => {
      try {
        if (navigator.permissions && navigator.permissions.query) {
          const result = await navigator.permissions.query({ name: 'camera' })
          const state = result.state
          setPermissionStatus(state) // 'granted', 'denied', or 'prompt'
          
          // If permission already granted, don't show prompt
          if (state === 'granted') {
            setShowPermissionPrompt(false)
          }
          
          result.onchange = () => {
            const newState = result.state
            setPermissionStatus(newState)
            if (newState === 'granted') {
              setShowPermissionPrompt(false)
            }
          }
        }
      } catch (err) {
        console.log("Permission API not supported, will request on user action")
        // Try to check by attempting to query devices (non-intrusive)
        try {
          const devices = await navigator.mediaDevices.enumerateDevices()
          const hasVideoInput = devices.some(device => device.kind === 'videoinput')
          if (!hasVideoInput) {
            console.log("No video input devices found")
          }
        } catch (e) {
          console.log("Cannot enumerate devices")
        }
      }
    }
    
    checkPermission()
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanning()
    }
  }, [])

  return (
    <div className="app">
      <div className="header">
        <h1>Event QR Scanner</h1>
        <div className="status-indicator">
          <span className={`status-dot ${isScanning ? 'active' : ''}`}></span>
          <span>{isScanning ? 'Scanning...' : 'Stopped'}</span>
        </div>
      </div>

      <div className="scanner-container">
        <div id="reader" className="qr-reader"></div>
        {showPermissionPrompt && !isScanning && permissionStatus !== 'granted' && (
          <div className="permission-prompt">
            <div className="permission-icon">📷</div>
            <h2>Camera Access Required</h2>
            {!isSecureContext && (
              <div className="https-warning">
                <p className="warning-text">⚠️ HTTPS Required</p>
                <p>Android Chrome requires HTTPS for camera access (except localhost).</p>
                <p className="permission-hint">
                  <strong>Solutions:</strong><br/>
                  1. Use <code>localhost:3000</code> or <code>127.0.0.1:3000</code><br/>
                  2. Enable HTTPS in Vite config<br/>
                  3. Use a tunneling service (ngrok, localtunnel)
                </p>
              </div>
            )}
            {isSecureContext && (
              <>
                <p>This app needs camera permission to scan QR codes.</p>
                <p className="permission-hint">Click the button below to allow camera access</p>
              </>
            )}
            <button onClick={requestCameraPermission} className="btn btn-primary permission-request-btn">
              Allow Camera Access
            </button>
          </div>
        )}
        {isInitializing && (
          <div className="loading-message">
            <div className="spinner"></div>
            <p>Requesting camera permission...</p>
          </div>
        )}
        {error && (
          <div className="error-message">
            <p><strong>Error:</strong> {error.includes('HTTPS_REQUIRED') ? 'HTTPS Required for Camera' : error}</p>
            {error.includes('HTTPS_REQUIRED') ? (
              <div className="https-instructions">
                <p className="error-hint">
                  <strong>Android Chrome blocks camera on HTTP (except localhost)</strong>
                </p>
                <div className="solution-list">
                  <div className="solution-item">
                    <strong>Option 1: Use localhost</strong>
                    <p>Access via <code>localhost:3000</code> or <code>127.0.0.1:3000</code></p>
                  </div>
                  <div className="solution-item">
                    <strong>Option 2: Enable HTTPS in Vite</strong>
                    <p>Update <code>vite.config.js</code> to use HTTPS</p>
                  </div>
                  <div className="solution-item">
                    <strong>Option 3: Use ngrok/localtunnel</strong>
                    <p>Create HTTPS tunnel: <code>npx localtunnel --port 3000</code></p>
                  </div>
                  <div className="solution-item">
                    <strong>Option 4: Manual Chrome Setting</strong>
                    <p>Chrome Settings → Site Settings → Camera → Allow for this site</p>
                    <p className="note-text">(May still be blocked on HTTP)</p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="error-hint">
                {error.includes("permission") || error.includes("denied")
                  ? "Please allow camera access in your browser settings" 
                  : "Make sure you granted camera permissions"}
              </p>
            )}
            <div className="error-actions">
              <button onClick={requestCameraPermission} className="retry-btn">
                Try Again
              </button>
              {permissionStatus === 'denied' && !error.includes('HTTPS_REQUIRED') && (
                <p className="error-hint" style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
                  If permission was denied, go to Chrome Settings → Site Settings → Camera → Allow
                </p>
              )}
            </div>
          </div>
        )}
        {!isScanning && !error && !isInitializing && permissionStatus === 'granted' && (
          <div className="info-message">
            <p>Camera ready. Scanner will start automatically.</p>
          </div>
        )}
      </div>

      {scannedData && (
        <div className="scan-result">
          <div className="result-header">
            <span className="success-icon">✓</span>
            <h2>Ticket Scanned</h2>
          </div>
          <div className="result-content">
            <div className="result-item">
              <label>QR Code:</label>
              <p className="qr-text">{scannedData.text}</p>
            </div>
            <div className="result-item">
              <label>Time:</label>
              <p>{scannedData.timestamp}</p>
            </div>
          </div>
        </div>
      )}

      <div className="controls">
        {!isScanning ? (
          <button onClick={requestCameraPermission} className="btn btn-primary">
            {permissionStatus === 'granted' ? 'Start Scanning' : 'Allow Camera & Start'}
          </button>
        ) : (
          <button onClick={stopScanning} className="btn btn-secondary">
            Stop Scanning
          </button>
        )}
      </div>

      {scanHistory.length > 0 && (
        <div className="scan-history">
          <h3>Recent Scans ({scanHistory.length})</h3>
          <div className="history-list">
            {scanHistory.map((scan, index) => (
              <div key={index} className="history-item">
                <span className="history-time">{scan.timestamp}</span>
                <span className="history-code">{scan.text.substring(0, 30)}...</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default App

