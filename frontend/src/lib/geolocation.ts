/**
 * Enhanced Geolocation utilities with improved accuracy
 * Uses multiple strategies to get the most accurate location possible
 */

export interface GeolocationResult {
  lat: number;
  lng: number;
  accuracy: number;
  altitude?: number;
  altitudeAccuracy?: number;
  heading?: number;
  speed?: number;
  timestamp: number;
}

export interface GeolocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
  maxAttempts?: number;
  minAccuracy?: number;
  useWatchPosition?: boolean;
  watchDuration?: number;
}

/**
 * Get current location with enhanced accuracy
 * Tries multiple strategies to get the most accurate location
 */
export function getEnhancedLocation(
  options: GeolocationOptions = {}
): Promise<GeolocationResult> {
  const {
    enableHighAccuracy = true,
    timeout = 20000, // Increased timeout to 20 seconds
    maximumAge = 0,
    maxAttempts = 3,
    minAccuracy = 100, // Prefer readings with accuracy better than 100m
    useWatchPosition = true,
    watchDuration = 5000, // Watch for 5 seconds to get multiple readings
  } = options;

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser'));
      return;
    }

    const readings: GeolocationResult[] = [];
    let watchId: number | null = null;
    let attemptCount = 0;
    let bestReading: GeolocationResult | null = null;
    let timeoutId: ReturnType<typeof setTimeout>;
    let watchTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let isResolved = false;

    const cleanup = () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (watchTimeoutId) {
        clearTimeout(watchTimeoutId);
        watchTimeoutId = null;
      }
    };

    const resolveOnce = (result: GeolocationResult) => {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      resolve(result);
    };

    const rejectOnce = (error: Error) => {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      reject(error);
    };

    const processPosition = (position: GeolocationPosition): GeolocationResult => {
      return {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy || Infinity,
        altitude: position.coords.altitude ?? undefined,
        altitudeAccuracy: position.coords.altitudeAccuracy ?? undefined,
        heading: position.coords.heading ?? undefined,
        speed: position.coords.speed ?? undefined,
        timestamp: position.timestamp,
      };
    };

    const onSuccess = (position: GeolocationPosition) => {
      if (isResolved) return;

      const reading = processPosition(position);
      readings.push(reading);

      // Update best reading if this one is better
      if (!bestReading || reading.accuracy < bestReading.accuracy) {
        bestReading = reading;
      }

      // If we got a reading with good accuracy, we can stop early
      if (reading.accuracy <= minAccuracy) {
        resolveOnce(reading);
        return;
      }
    };

    const onError = (error: GeolocationPositionError) => {
      if (isResolved) return;

      attemptCount++;
      
      // If we have at least one reading, use it even if there were errors
      if (bestReading && readings.length > 0) {
        resolveOnce(bestReading);
        return;
      }

      // Only reject if we have no readings and exhausted attempts
      if (attemptCount >= maxAttempts && readings.length === 0) {
        const errorMsg =
          error.code === 1
            ? 'Location permission denied. Please enable location access in your browser settings.'
            : error.code === 2
            ? 'Location unavailable. Please check your GPS/WiFi settings.'
            : error.code === 3
            ? 'Location request timeout. Please try again or move to an area with better GPS signal.'
            : 'Failed to get location';
        rejectOnce(new Error(errorMsg));
      }
    };

    const geolocationOptions: PositionOptions = {
      enableHighAccuracy,
      timeout: Math.min(timeout, 10000), // Max 10s per individual request
      maximumAge,
    };

    // Set overall timeout
    timeoutId = setTimeout(() => {
      if (isResolved) return;
      
      if (bestReading) {
        resolveOnce(bestReading);
      } else if (readings.length > 0) {
        // Use the most recent reading if we have any
        resolveOnce(readings[readings.length - 1]);
      } else {
        rejectOnce(new Error('Location request timeout. Please try again or move to an area with better GPS signal.'));
      }
    }, timeout + (useWatchPosition ? watchDuration : 0) + 1000);

    if (useWatchPosition) {
      // Use watchPosition to get multiple readings over time for better accuracy
      watchId = navigator.geolocation.watchPosition(
        onSuccess,
        onError,
        geolocationOptions
      );

      // Stop watching after watchDuration and return best reading
      watchTimeoutId = setTimeout(() => {
        if (isResolved) return;

        if (watchId !== null) {
          navigator.geolocation.clearWatch(watchId);
          watchId = null;
        }

        if (bestReading) {
          resolveOnce(bestReading);
        } else if (readings.length > 0) {
          // Use the most recent reading
          resolveOnce(readings[readings.length - 1]);
        } else {
          // Fallback to getCurrentPosition if watchPosition didn't get anything
          navigator.geolocation.getCurrentPosition(
            (position) => {
              if (!isResolved) {
                resolveOnce(processPosition(position));
              }
            },
            (error) => {
              if (!isResolved) {
                onError(error);
                // If still no readings, reject
                if (readings.length === 0) {
                  rejectOnce(new Error('Failed to get location. Please check your GPS settings and try again.'));
                }
              }
            },
            geolocationOptions
          );
        }
      }, watchDuration);
    } else {
      // Use getCurrentPosition with retries
      const tryGetPosition = (attempt: number = 1) => {
        if (isResolved || attempt > maxAttempts) {
          if (!isResolved && readings.length > 0) {
            resolveOnce(bestReading || readings[readings.length - 1]);
          }
          return;
        }

        navigator.geolocation.getCurrentPosition(
          onSuccess,
          (error) => {
            onError(error);
            // Retry after a short delay if we haven't resolved yet
            if (!isResolved && attempt < maxAttempts) {
              setTimeout(() => tryGetPosition(attempt + 1), 1000);
            }
          },
          geolocationOptions
        );
      };

      tryGetPosition();
    }
  });
}

/**
 * Get current location with simplified interface (backward compatible)
 */
export function getCurrentLocation(
  options: {
    enableHighAccuracy?: boolean;
    timeout?: number;
    maximumAge?: number;
  } = {}
): Promise<{ lat: number; lng: number; accuracy: number }> {
  return getEnhancedLocation({
    enableHighAccuracy: options.enableHighAccuracy ?? true,
    timeout: options.timeout ?? 15000,
    maximumAge: options.maximumAge ?? 0,
    maxAttempts: 2,
    minAccuracy: 50,
    useWatchPosition: true,
    watchDuration: 3000,
  }).then((result) => ({
    lat: result.lat,
    lng: result.lng,
    accuracy: result.accuracy,
  }));
}


