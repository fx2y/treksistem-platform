// Security utilities for frontend authentication and protection

/**
 * Enhanced device fingerprinting for security tracking
 */
export function generateAdvancedFingerprint(): string {
  if (typeof window === 'undefined') {
    return 'server-side-render'
  }

  try {
    // Collect comprehensive device and browser information
    const fingerprint = {
      // Basic browser info
      userAgent: navigator.userAgent,
      language: navigator.language,
      languages: navigator.languages?.join(',') || '',
      platform: navigator.platform,
      
      // Screen and display info
      screen: {
        width: screen.width,
        height: screen.height,
        colorDepth: screen.colorDepth,
        pixelDepth: screen.pixelDepth,
        availWidth: screen.availWidth,
        availHeight: screen.availHeight
      },
      
      // Timezone and locale
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffset: new Date().getTimezoneOffset(),
      
      // Browser capabilities
      cookies: navigator.cookieEnabled,
      localStorage: !!window.localStorage,
      sessionStorage: !!window.sessionStorage,
      indexedDB: !!window.indexedDB,
      
      // Hardware info (if available)
      hardwareConcurrency: navigator.hardwareConcurrency || 0,
      deviceMemory: (navigator as Record<string, unknown>).deviceMemory || 0,
      
      // Canvas fingerprinting (more advanced)
      canvas: generateCanvasFingerprint(),
      
      // WebGL fingerprinting
      webgl: generateWebGLFingerprint(),
      
      // Audio context fingerprinting
      audio: generateAudioFingerprint()
    }

    // Create a hash of the fingerprint
    const fingerprintString = JSON.stringify(fingerprint)
    return btoa(fingerprintString).slice(0, 64) // First 64 chars of base64
  } catch (error) {
    console.warn('Fingerprint generation failed:', error)
    return `fallback-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }
}

/**
 * Generate canvas fingerprint for device identification
 */
function generateCanvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    
    if (!ctx) return 'no-canvas'
    
    // Draw some text and shapes
    ctx.textBaseline = 'top'
    ctx.font = '14px Arial'
    ctx.fillStyle = '#f60'
    ctx.fillRect(125, 1, 62, 20)
    ctx.fillStyle = '#069'
    ctx.fillText('Treksistem Security 🔒', 2, 15)
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)'
    ctx.fillText('Device Fingerprint', 4, 45)
    
    // Add some geometric shapes
    ctx.globalCompositeOperation = 'multiply'
    ctx.fillStyle = 'rgb(255,0,255)'
    ctx.beginPath()
    ctx.arc(50, 50, 50, 0, Math.PI * 2, true)
    ctx.closePath()
    ctx.fill()
    
    return canvas.toDataURL()
  } catch {
    return 'canvas-error'
  }
}

/**
 * Generate WebGL fingerprint
 */

function generateWebGLFingerprint(): string {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    
    if (!gl) return 'no-webgl'
    
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info') as (WebGLDebugRendererInfo & {
      UNMASKED_VENDOR_WEBGL: number
      UNMASKED_RENDERER_WEBGL: number
    }) | null
    let vendor = 'unknown'
    let renderer = 'unknown'
    
    if (debugInfo) {
      try {
        const vendorParam = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) as string
        const rendererParam = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string
        vendor = vendorParam || 'unknown'
        renderer = rendererParam || 'unknown'
      } catch {
        // Use defaults
      }
    }
    
    return `${vendor}|${renderer}`
  } catch {
    return 'webgl-error'
  }
}

/**
 * Generate audio context fingerprint
 */
function generateAudioFingerprint(): string {
  try {
    const AudioContext = window.AudioContext || (window as Record<string, unknown>).webkitAudioContext
    if (!AudioContext) return 'no-audio'
    
    const audioCtx = new AudioContext()
    const oscillator = audioCtx.createOscillator()
    const analyser = audioCtx.createAnalyser()
    const gain = audioCtx.createGain()
    const scriptProcessor = audioCtx.createScriptProcessor(4096, 1, 1)
    
    gain.gain.setValueAtTime(0, audioCtx.currentTime)
    oscillator.connect(analyser)
    analyser.connect(scriptProcessor)
    scriptProcessor.connect(gain)
    gain.connect(audioCtx.destination)
    
    oscillator.start(0)
    
    const fingerprint = `${audioCtx.sampleRate}-${audioCtx.destination.maxChannelCount}`
    
    // Cleanup
    oscillator.stop()
    oscillator.disconnect()
    scriptProcessor.disconnect()
    analyser.disconnect()
    gain.disconnect()
    
    return fingerprint
  } catch {
    return 'audio-error'
  }
}

/**
 * Secure storage utility with encryption and integrity checks
 */
export class SecureStorage {
  private static readonly PREFIX = 'treksistem_'
  private static readonly INTEGRITY_SUFFIX = '_integrity'

  /**
   * Store data securely with integrity check
   */
  static set(key: string, value: unknown, options: {
    encrypt?: boolean
    expiresIn?: number // milliseconds
  } = {}): boolean {
    try {
      const data = {
        value,
        timestamp: Date.now(),
        expiresAt: options.expiresIn ? Date.now() + options.expiresIn : null
      }

      let serialized = JSON.stringify(data)
      
      // Simple XOR encryption (for demonstration - use real encryption in production)
      if (options.encrypt) {
        serialized = this.simpleEncrypt(serialized)
      }

      const storageKey = this.PREFIX + key
      const integrityKey = storageKey + this.INTEGRITY_SUFFIX
      
      // Store data
      localStorage.setItem(storageKey, serialized)
      
      // Store integrity hash
      const hash = this.generateHash(serialized)
      localStorage.setItem(integrityKey, hash)

      return true
    } catch {
      console.error('SecureStorage.set failed')
      return false
    }
  }

  /**
   * Retrieve data securely with integrity verification
   */
  static get(key: string, options: { 
    decrypt?: boolean 
  } = {}): unknown {
    try {
      const storageKey = this.PREFIX + key
      const integrityKey = storageKey + this.INTEGRITY_SUFFIX
      
      const serialized = localStorage.getItem(storageKey)
      const storedHash = localStorage.getItem(integrityKey)
      
      if (!serialized || !storedHash) {
        return null
      }

      // Verify integrity
      const currentHash = this.generateHash(serialized)
      if (currentHash !== storedHash) {
        console.warn('SecureStorage: Integrity check failed for', key)
        this.remove(key)
        return null
      }

      let decrypted = serialized
      if (options.decrypt) {
        decrypted = this.simpleDecrypt(serialized)
      }

      const data = JSON.parse(decrypted) as { value: unknown; expiresAt?: number }
      
      // Check expiration
      if (data.expiresAt && Date.now() > data.expiresAt) {
        this.remove(key)
        return null
      }

      return data.value
    } catch (error) {
      console.error('SecureStorage.get failed:', error)
      this.remove(key) // Remove corrupted data
      return null
    }
  }

  /**
   * Remove stored data and integrity hash
   */
  static remove(key: string): void {
    try {
      const storageKey = this.PREFIX + key
      const integrityKey = storageKey + this.INTEGRITY_SUFFIX
      
      localStorage.removeItem(storageKey)
      localStorage.removeItem(integrityKey)
    } catch (error) {
      console.error('SecureStorage.remove failed:', error)
    }
  }

  /**
   * Clear all secure storage items
   */
  static clear(): void {
    try {
      const keysToRemove: string[] = []
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith(this.PREFIX)) {
          keysToRemove.push(key)
        }
      }

      keysToRemove.forEach(key => localStorage.removeItem(key))
    } catch (error) {
      console.error('SecureStorage.clear failed:', error)
    }
  }

  /**
   * Simple encryption for demonstration (use real encryption in production)
   */
  private static simpleEncrypt(text: string): string {
    const key = 'treksistem-key' // In production, use a proper key derivation
    let encrypted = ''
    
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
      encrypted += String.fromCharCode(charCode)
    }
    
    return btoa(encrypted)
  }

  /**
   * Simple decryption for demonstration
   */
  private static simpleDecrypt(encrypted: string): string {
    const key = 'treksistem-key'
    const decoded = atob(encrypted)
    let decrypted = ''
    
    for (let i = 0; i < decoded.length; i++) {
      const charCode = decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length)
      decrypted += String.fromCharCode(charCode)
    }
    
    return decrypted
  }

  /**
   * Generate simple hash for integrity checking
   */
  private static generateHash(data: string): string {
    let hash = 0
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return hash.toString(36)
  }
}

/**
 * CSRF token management
 */
export class CSRFTokenManager {
  private static readonly TOKEN_KEY = 'csrf_token'
  private static readonly HEADER_NAME = 'X-CSRF-Token'

  /**
   * Generate and store a new CSRF token
   */
  static generateToken(): string {
    const token = this.generateRandomToken()
    SecureStorage.set(this.TOKEN_KEY, token, { 
      expiresIn: 24 * 60 * 60 * 1000 // 24 hours
    })
    return token
  }

  /**
   * Get current CSRF token
   */
  static getToken(): string | null {
    return SecureStorage.get(this.TOKEN_KEY)
  }

  /**
   * Get CSRF token headers for requests
   */
  static getHeaders(): Record<string, string> {
    const token = this.getToken()
    return token ? { [this.HEADER_NAME]: token } : {}
  }

  /**
   * Clear CSRF token
   */
  static clearToken(): void {
    SecureStorage.remove(this.TOKEN_KEY)
  }

  /**
   * Generate random token
   */
  private static generateRandomToken(): string {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
  }
}

/**
 * Security utilities for DOM protection
 */
export class DOMSecurity {
  /**
   * Prevent console access in production
   */
  static disableConsole(): void {
    if (process.env.NODE_ENV === 'production') {
      console.log = () => {}
      console.warn = () => {}
      console.error = () => {}
      console.debug = () => {}
      console.info = () => {}
    }
  }

  /**
   * Prevent developer tools detection (basic)
   */
  static preventDevTools(): void {
    if (process.env.NODE_ENV === 'production') {
      setInterval(() => {
        const start = Date.now()
        // This will be slower if devtools is open
        console.debug('Checking developer tools')
        if (Date.now() - start > 100) {
          document.body.innerHTML = '<h1>Developer tools detected</h1>'
          throw new Error('Developer tools detected')
        }
      }, 1000)
    }
  }

  /**
   * Prevent right-click context menu
   */
  static disableContextMenu(): void {
    document.addEventListener('contextmenu', e => e.preventDefault())
  }

  /**
   * Disable text selection
   */
  static disableTextSelection(): void {
    document.addEventListener('selectstart', e => e.preventDefault())
    document.addEventListener('dragstart', e => e.preventDefault())
  }

  /**
   * Add security headers via meta tags
   */
  static addSecurityMeta(): void {
    const meta = [
      { name: 'referrer', content: 'strict-origin-when-cross-origin' },
      { name: 'robots', content: 'noindex, nofollow' },
      { 'http-equiv': 'X-Content-Type-Options', content: 'nosniff' },
      { 'http-equiv': 'X-Frame-Options', content: 'DENY' }
    ]

    meta.forEach(({ name, content, 'http-equiv': httpEquiv }) => {
      const metaTag = document.createElement('meta')
      if (name) metaTag.name = name
      if (httpEquiv) metaTag.httpEquiv = httpEquiv
      metaTag.content = content
      document.head.appendChild(metaTag)
    })
  }
}

/**
 * Network security utilities
 */
export class NetworkSecurity {
  /**
   * Create secure fetch wrapper with automatic CSRF and auth headers
   */
  static createSecureFetch() {
    return async (url: string, options: RequestInit = {}) => {
      const secureHeaders = {
        ...CSRFTokenManager.getHeaders(),
        'X-Requested-With': 'XMLHttpRequest',
        ...options.headers
      }

      return fetch(url, {
        ...options,
        headers: secureHeaders,
        credentials: 'same-origin' // Ensure cookies are sent
      })
    }
  }

  /**
   * Validate URL to prevent SSRF attacks
   */
  static isSecureURL(url: string): boolean {
    try {
      const parsed = new URL(url)
      
      // Only allow HTTPS in production
      if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
        return false
      }
      
      // Block private IP ranges
      const hostname = parsed.hostname
      const privateRanges = [
        /^10\./,
        /^172\.(?:1[6-9]|2[0-9]|3[01])\./,
        /^192\.168\./,
        /^127\./,
        /^localhost$/i,
        /^0\.0\.0\.0$/
      ]
      
      return !privateRanges.some(range => range.test(hostname))
    } catch {
      return false
    }
  }
}

/**
 * Initialize security features
 */
export function initializeSecurity(options: {
  disableConsole?: boolean
  preventDevTools?: boolean
  disableContextMenu?: boolean
  disableTextSelection?: boolean
  addSecurityMeta?: boolean
} = {}) {
  if (typeof window === 'undefined') return

  const {
    disableConsole = false,
    preventDevTools = false,
    disableContextMenu = false,
    disableTextSelection = false,
    addSecurityMeta = true
  } = options

  if (disableConsole) DOMSecurity.disableConsole()
  if (preventDevTools) DOMSecurity.preventDevTools()
  if (disableContextMenu) DOMSecurity.disableContextMenu()
  if (disableTextSelection) DOMSecurity.disableTextSelection()
  if (addSecurityMeta) DOMSecurity.addSecurityMeta()

  // Initialize CSRF token
  if (!CSRFTokenManager.getToken()) {
    CSRFTokenManager.generateToken()
  }
}