import { useState, useEffect, useRef, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import './App.css'

function App() {
  const [isScanning, setIsScanning] = useState(false)
  const [scannedData, setScannedData] = useState(null)
  const [scanStatus, setScanStatus] = useState(null) // 'success', 'duplicate', null
  const [scanHistory, setScanHistory] = useState([])
  const [error, setError] = useState(null)
  const [isInitializing, setIsInitializing] = useState(false)
  const [permissionStatus, setPermissionStatus] = useState('prompt') // 'prompt', 'granted', 'denied'
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(true)
  const [isSecureContext, setIsSecureContext] = useState(true)
  const scannerRef = useRef(null)
  const html5QrCodeRef = useRef(null)
  const lastScanRef = useRef({ code: null, timestamp: 0 })
  const scannedCodesRef = useRef(new Set()) // Track all scanned QR codes
  const wasScanningRef = useRef(false) // Track if scanner was running before page went to background
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

  // Audio context ref (needs to be created after user interaction)
  const audioContextRef = useRef(null)

  // Initialize audio context (must be called after user interaction)
  const initAudioContext = () => {
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      } catch (err) {
        console.log("Audio context not available:", err)
      }
    }
    // Resume if suspended (some browsers suspend on page load)
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume()
    }
  }

  // Play sound feedback
  const playSound = (type) => {
    try {
      initAudioContext()
      if (!audioContextRef.current) return

      const audioContext = audioContextRef.current
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      if (type === 'success') {
        // Success sound: two beeps (higher pitch)
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime)
        oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1)
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2)
        oscillator.start(audioContext.currentTime)
        oscillator.stop(audioContext.currentTime + 0.2)
      } else if (type === 'error') {
        // Error sound: lower beep
        oscillator.frequency.setValueAtTime(400, audioContext.currentTime)
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)
        oscillator.start(audioContext.currentTime)
        oscillator.stop(audioContext.currentTime + 0.3)
      }
    } catch (err) {
      console.log("Sound not available:", err)
    }
  }

  // Vibrate device (mobile)
  const vibrate = (pattern) => {
    try {
      if (navigator.vibrate) {
        navigator.vibrate(pattern)
      }
    } catch (err) {
      console.log("Vibration not available:", err)
    }
  }

  // Trigger success feedback
  const triggerSuccessFeedback = () => {
    playSound('success')
    vibrate([100, 50, 100]) // Short vibration pattern
  }

  // Trigger error/duplicate feedback
  const triggerErrorFeedback = () => {
    playSound('error')
    vibrate([200, 100, 200]) // Longer vibration pattern for error
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
      
      // Initialize audio context after user interaction
      initAudioContext()
      
      // Small delay to ensure camera is fully released before html5-qrcode accesses it
      await new Promise(resolve => setTimeout(resolve, 300))
      
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

      // Clear any existing content in reader to avoid conflicts
      readerElement.innerHTML = ''
      console.log("Reader element cleared and ready")

      const html5QrCode = new Html5Qrcode("reader")
      html5QrCodeRef.current = html5QrCode

      const qrBoxSize = getQrBoxSize()
      console.log("QR box size calculated:", qrBoxSize)

      // Try with simplified config first (better for mobile)
      const config = {
        fps: 10, // Start with lower FPS for mobile compatibility
        qrbox: qrBoxSize,
        aspectRatio: 1.0,
        disableFlip: false,
        // Remove videoConstraints for better mobile compatibility
      }

      // Try back camera first - html5-qrcode accepts string or object
      console.log("Starting QR scanner with config:", config)
      
      // Small delay to ensure DOM is ready
      await new Promise(resolve => setTimeout(resolve, 100))
      
      try {
        // Try with object format first (back camera)
        await html5QrCode.start(
          { facingMode: "environment" },
          config,
          (decodedText, decodedResult) => {
            console.log("QR Code detected:", decodedText)
            handleScanSuccess(decodedText, decodedResult)
          },
          (errorMessage) => {
            // Ignore scanning errors, just continue
            if (!errorMessage.includes("NotFoundException")) {
              console.log("Scan error (ignored):", errorMessage)
            }
          }
        )
        console.log("QR scanner started successfully with back camera")
      } catch (backCameraError) {
        console.log("Back camera failed, trying any camera:", backCameraError)
        // Fallback: try with string format or any camera
        try {
          await html5QrCode.start(
            "environment", // String format
            config,
            (decodedText, decodedResult) => {
              console.log("QR Code detected:", decodedText)
              handleScanSuccess(decodedText, decodedResult)
            },
            (errorMessage) => {
              if (!errorMessage.includes("NotFoundException")) {
                console.log("Scan error (ignored):", errorMessage)
              }
            }
          )
          console.log("QR scanner started with string format")
        } catch (stringError) {
          // Last resort: try user-facing camera or any available
          console.log("Environment camera failed, trying user camera:", stringError)
          await html5QrCode.start(
            { facingMode: "user" },
            config,
            (decodedText, decodedResult) => {
              console.log("QR Code detected:", decodedText)
              handleScanSuccess(decodedText, decodedResult)
            },
            (errorMessage) => {
              if (!errorMessage.includes("NotFoundException")) {
                console.log("Scan error (ignored):", errorMessage)
              }
            }
          )
          console.log("QR scanner started with user camera")
        }
      }
      
      setIsScanning(true)
      setIsInitializing(false)
      wasScanningRef.current = true // Mark that scanner was running
      
      // Verify video element exists after a short delay
      setTimeout(() => {
        const video = document.querySelector("#reader video")
        if (video) {
          console.log("Video element found:", video)
          console.log("Video dimensions:", video.videoWidth, "x", video.videoHeight)
          // Check if video is actually playing
          if (video.readyState >= 2) {
            console.log("Video is playing")
          } else {
            console.warn("Video element exists but not playing yet")
          }
        } else {
          console.warn("Video element not found in #reader")
          // Try to find it in different locations
          const allVideos = document.querySelectorAll("video")
          console.log("Found video elements:", allVideos.length)
          if (allVideos.length > 0) {
            console.log("Video found elsewhere, checking...")
          }
        }
      }, 1500)
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
      wasScanningRef.current = false // Mark that scanner is stopped
    } catch (err) {
      console.error("Error stopping scanner:", err)
      wasScanningRef.current = false
    }
  }

  // Check if camera is actually working
  const checkCameraWorking = () => {
    const video = document.querySelector("#reader video")
    if (video) {
      // Check if video is playing
      return video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0
    }
    return false
  }

  // Restart scanner if it was running before
  // Restart scanner if it was running before (wrapped in useCallback to access latest state)
  const restartScannerIfNeeded = useCallback(async () => {
    // Only restart if:
    // 1. Scanner was running before
    // 2. Permission is granted
    // 3. Scanner is not currently running or camera is not working
    if (wasScanningRef.current && permissionStatus === 'granted') {
      const isWorking = checkCameraWorking()
      
      if (!isScanning || !isWorking) {
        console.log("Page became visible - restarting camera scanner...")
        setIsInitializing(true)
        setError(null)
        
        try {
          // Stop any existing scanner first
          if (html5QrCodeRef.current) {
            try {
              await html5QrCodeRef.current.stop()
              await html5QrCodeRef.current.clear()
            } catch (e) {
              console.log("Error cleaning up old scanner:", e)
            }
            html5QrCodeRef.current = null
          }
          
          // Small delay before restarting
          await new Promise(resolve => setTimeout(resolve, 500))
          
          // Restart the scanner
          await startScanner()
        } catch (err) {
          console.error("Error restarting scanner:", err)
          setError("Camera lost connection. Please refresh the page.")
          setIsInitializing(false)
          wasScanningRef.current = false
        }
      }
    }
  }, [isScanning, permissionStatus])

  const handleScanSuccess = (decodedText, decodedResult) => {
    const now = Date.now()
    const lastScan = lastScanRef.current

    // Debounce: Skip if same code scanned within debounce time
    if (lastScan.code === decodedText && (now - lastScan.timestamp) < DEBOUNCE_TIME) {
      return
    }

    // Update last scan
    lastScanRef.current = { code: decodedText, timestamp: now }

    // Check if QR code was already scanned
    const isDuplicate = scannedCodesRef.current.has(decodedText)

    if (isDuplicate) {
      // Already scanned - show duplicate message
      setScanStatus('duplicate')
      setScannedData({
        text: decodedText,
        timestamp: new Date().toLocaleTimeString(),
        raw: decodedResult,
        isDuplicate: true
      })
      triggerErrorFeedback()
      
      // Auto-reset after showing duplicate message
      setTimeout(() => {
        setScannedData(null)
        setScanStatus(null)
      }, 2000) // Show duplicate message for 2 seconds
    } else {
      // New scan - add to scanned codes and process
      scannedCodesRef.current.add(decodedText)
      setScanStatus('success')
      setScannedData({
        text: decodedText,
        timestamp: new Date().toLocaleTimeString(),
        raw: decodedResult,
        isDuplicate: false
      })
      triggerSuccessFeedback()

      // Add to history
      setScanHistory(prev => [
        { text: decodedText, timestamp: new Date().toLocaleTimeString(), isDuplicate: false },
        ...prev.slice(0, 9) // Keep last 10 scans
      ])

      // Auto-reset after showing result (for continuous scanning)
      setTimeout(() => {
        setScannedData(null)
        setScanStatus(null)
      }, 2000) // Show success message for 2 seconds
    }
  }

  // Auto-start scanner if permission is already granted
  const autoStartIfPermissionGranted = async () => {
    try {
      // Check if we're in a secure context
      const secure = checkSecureContext()
      if (!secure) {
        console.log("Not in secure context, cannot auto-start")
        return
      }

      // Check if camera is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.log("Camera not supported")
        return
      }

      // Try to access camera (this will work if permission is granted)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: "environment" } 
        })
        // Permission is granted - stop test stream and start scanner
        stream.getTracks().forEach(track => track.stop())
        
        console.log("Permission already granted - auto-starting camera...")
        setShowPermissionPrompt(false)
        setPermissionStatus('granted')
        initAudioContext()
        
        // Small delay before starting scanner
        await new Promise(resolve => setTimeout(resolve, 300))
        await startScanner()
      } catch (err) {
        // Permission not granted or camera not available
        console.log("Cannot auto-start:", err.name)
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setPermissionStatus('denied')
        }
      }
    } catch (err) {
      console.log("Error in auto-start:", err)
    }
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
          
          // If permission already granted, auto-start scanner
          if (state === 'granted') {
            setShowPermissionPrompt(false)
            // Auto-start after a small delay to ensure DOM is ready
            setTimeout(() => {
              autoStartIfPermissionGranted()
            }, 500)
          }
          
          result.onchange = () => {
            const newState = result.state
            setPermissionStatus(newState)
            if (newState === 'granted') {
              setShowPermissionPrompt(false)
              // Auto-start when permission changes to granted
              setTimeout(() => {
                autoStartIfPermissionGranted()
              }, 500)
            }
          }
        } else {
          // Permission API not supported - try to auto-start anyway
          console.log("Permission API not supported, attempting auto-start...")
          setTimeout(() => {
            autoStartIfPermissionGranted()
          }, 1000)
        }
      } catch (err) {
        console.log("Permission check error, attempting auto-start:", err)
        // Try to auto-start anyway
        setTimeout(() => {
          autoStartIfPermissionGranted()
        }, 1000)
      }
    }
    
    checkPermission()
  }, [])

  // Handle page visibility changes (when phone wakes up)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log("Page became visible")
        // Small delay to ensure page is fully active
        setTimeout(() => {
          restartScannerIfNeeded()
        }, 300)
      } else if (document.visibilityState === 'hidden') {
        console.log("Page became hidden")
        // Remember that scanner was running
        wasScanningRef.current = isScanning
      }
    }

    const handleFocus = () => {
      console.log("Window focused")
      setTimeout(() => {
        restartScannerIfNeeded()
      }, 300)
    }

    const handlePageShow = (event) => {
      if (event.persisted) {
        console.log("Page restored from cache")
        setTimeout(() => {
          restartScannerIfNeeded()
        }, 300)
      }
    }

    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    // Also listen for focus events (when user switches back to tab)
    window.addEventListener('focus', handleFocus)

    // Listen for page show event (when page is restored from back/forward cache)
    window.addEventListener('pageshow', handlePageShow)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [isScanning, permissionStatus, restartScannerIfNeeded])

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
            <p>Starting camera...</p>
            <p className="loading-hint">Please wait while we initialize the camera</p>
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
        <div className={`scan-result ${scannedData.isDuplicate ? 'scan-result-duplicate' : 'scan-result-success'}`}>
          <div className="result-header">
            {scannedData.isDuplicate ? (
              <>
                <span className="error-icon">⚠</span>
                <h2>Already Scanned</h2>
              </>
            ) : (
              <>
                <span className="success-icon">✓</span>
                <h2>Ticket Scanned</h2>
              </>
            )}
          </div>
          <div className="result-content">
            <div className="result-item">
              <label>QR Code:</label>
              <p className="qr-text">{scannedData.text}</p>
            </div>
            {scannedData.isDuplicate && (
              <div className="duplicate-warning">
                <p>This ticket was already scanned before.</p>
              </div>
            )}
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
              <div key={index} className={`history-item ${scan.isDuplicate ? 'history-duplicate' : ''}`}>
                <span className="history-time">{scan.timestamp}</span>
                <span className="history-code">{scan.text.substring(0, 30)}...</span>
                {scan.isDuplicate && <span className="history-badge">Duplicate</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default App

