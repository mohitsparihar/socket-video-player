import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { useCallback, useEffect, useRef, useState } from 'react';

export default function MapPanel({
  center = { lat: 40.758, lng: -73.9855 },
  zoom = 13,
  isAdmin = false,
  onUpdate,
  gpsData = null,
  currentPosition = null,
}) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const lastSentRef = useRef({ center, zoom });
  const [mapError, setMapError] = useState(null);
  const [mapReady, setMapReady] = useState(false);

  const mapsLibRef = useRef(null);
  const currentMarkerRef = useRef(null);
  const traveledPathRef = useRef(null);
  const futurePathRef = useRef(null);
  const gpsMarkersRef = useRef([]);

  const loadMaps = useCallback(async () => {
    if (!apiKey) return null;
    setMapError(null);
    // Loader expects "key" and "v", not "apiKey" / "version"
    setOptions({ key: apiKey, v: 'weekly' });
    try {
      if (!mapsLibRef.current) {
        mapsLibRef.current = await importLibrary('maps');
      }
      return mapsLibRef.current;
    } catch (err) {
      const message = err?.message || String(err);
      setMapError(message);
      return null;
    }
  }, [apiKey]);

  useEffect(() => {
    if (!apiKey || !mapRef.current) return;
    let isMounted = true;
    setMapError(null);

    (async () => {
      const libs = await loadMaps();
      if (!isMounted || !libs || mapInstanceRef.current || !mapRef.current) return;
      try {
        const map = new libs.Map(mapRef.current, {
          center,
          zoom,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        mapInstanceRef.current = map;

      if (!isAdmin) {
        map.setOptions({
          gestureHandling: 'none',
          keyboardShortcuts: false,
          draggable: false,
          zoomControl: false,
        });
      }

      if (isAdmin) {
        map.addListener('idle', () => {
          const c = map.getCenter();
          const z = map.getZoom();
          if (!c || typeof z !== 'number') return;
          const next = { lat: c.lat(), lng: c.lng() };
          const last = lastSentRef.current;
          const moved =
            Math.abs(last.center.lat - next.lat) > 0.00001 ||
            Math.abs(last.center.lng - next.lng) > 0.00001 ||
            last.zoom !== z;
          if (moved) {
            lastSentRef.current = { center: next, zoom: z };
            onUpdate?.({ mapCenter: next, mapZoom: z });
          }
        });
      }

      // Signal that map is ready
      if (isMounted) {
        setMapReady(true);
        console.log('Map is ready!');
      }
      } catch (err) {
        if (isMounted) setMapError(err?.message || 'Failed to create map');
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [apiKey, isAdmin, onUpdate, center, zoom, loadMaps]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const current = map.getCenter();
    if (
      !current ||
      Math.abs(current.lat() - center.lat) > 0.00001 ||
      Math.abs(current.lng() - center.lng) > 0.00001
    ) {
      map.setCenter(center);
    }
    if (map.getZoom() !== zoom) {
      map.setZoom(zoom);
    }
  }, [center, zoom]);

  // Draw GPS path and markers
  useEffect(() => {
    if (!mapReady) {
      console.log('GPS effect: waiting for map to be ready');
      return;
    }

    const map = mapInstanceRef.current;
    if (!map || !gpsData?.gpsData || !mapsLibRef.current) {
      console.log('GPS effect early return:', {
        hasMap: !!map,
        hasGpsData: !!gpsData?.gpsData,
        hasLibs: !!mapsLibRef.current,
        gpsData
      });
      return;
    }

    console.log('Drawing GPS data:', gpsData);

    // Clear existing GPS markers
    gpsMarkersRef.current.forEach(marker => marker.setMap(null));
    gpsMarkersRef.current = [];

    // Clear existing polylines
    if (traveledPathRef.current) {
      traveledPathRef.current.setMap(null);
      traveledPathRef.current = null;
    }
    if (futurePathRef.current) {
      futurePathRef.current.setMap(null);
      futurePathRef.current = null;
    }

    const points = gpsData.gpsData;
    if (!points || points.length === 0) {
      console.log('No GPS points found');
      return;
    }

    console.log(`Drawing ${points.length} GPS points`);

    // Create path coordinates
    const pathCoordinates = points.map(p => ({ lat: p.lat, lng: p.lng }));

    // Calculate bounds to fit all GPS points
    if (window.google?.maps?.LatLngBounds) {
      const bounds = new window.google.maps.LatLngBounds();
      pathCoordinates.forEach(coord => bounds.extend(coord));

      // Fit map to show all GPS points with some padding
      map.fitBounds(bounds, {
        top: 50,
        right: 50,
        bottom: 50,
        left: 50,
      });

      // Optionally set a max zoom level so it doesn't zoom in too much for very small paths
      window.google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
        const currentZoom = map.getZoom();
        if (currentZoom > 18) {
          map.setZoom(18);
        }
      });

      console.log('Map bounds adjusted to fit GPS path');
    }

    // Initially draw entire path as gray (future path)
    if (window.google?.maps?.Polyline) {
      futurePathRef.current = new window.google.maps.Polyline({
        path: pathCoordinates,
        geodesic: true,
        strokeColor: '#9CA3AF',
        strokeOpacity: 0.5,
        strokeWeight: 3,
        map: map,
      });
      console.log('Initial path created (gray)');
    } else {
      console.error('Polyline class not found');
    }

    // Add small markers for each GPS point using global google.maps
    if (window.google?.maps?.Marker) {
      points.forEach((point, index) => {
        const timeInSeconds = point.timestamp ?? (point.timeMs ? point.timeMs / 1000 : 0);
        const marker = new window.google.maps.Marker({
          position: { lat: point.lat, lng: point.lng },
          map: map,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: '#4285F4',
            fillOpacity: 0.8,
            strokeColor: '#ffffff',
            strokeWeight: 2,
            scale: 4,
          },
          title: `Point ${index + 1} at ${timeInSeconds.toFixed(1)}s`,
        });
        gpsMarkersRef.current.push(marker);
      });
      console.log(`Created ${gpsMarkersRef.current.length} markers`);
    } else {
      console.error('Marker class not found');
    }

    return () => {
      gpsMarkersRef.current.forEach(marker => marker.setMap(null));
      gpsMarkersRef.current = [];
      if (traveledPathRef.current) {
        traveledPathRef.current.setMap(null);
        traveledPathRef.current = null;
      }
      if (futurePathRef.current) {
        futurePathRef.current.setMap(null);
        futurePathRef.current = null;
      }
    };
  }, [gpsData, mapReady]);

  // Update current position marker and path coloring
  useEffect(() => {
    if (!mapReady) {
      console.log('Current position effect: waiting for map to be ready');
      return;
    }

    const map = mapInstanceRef.current;

    // If no current position, clean up marker but keep map
    if (!currentPosition) {
      if (currentMarkerRef.current) {
        currentMarkerRef.current.setMap(null);
        currentMarkerRef.current = null;
        console.log('Cleaned up current position marker (no position)');
      }
      return;
    }

    if (!map || !mapsLibRef.current) {
      console.log('Current position effect early return:', {
        hasMap: !!map,
        hasPosition: !!currentPosition,
        hasLibs: !!mapsLibRef.current,
        currentPosition
      });
      return;
    }

    console.log('Updating current position marker:', currentPosition);

    if (!window.google?.maps?.Marker) {
      console.error('Marker class not found for current position');
      return;
    }

    // Create or update current position marker
    if (!currentMarkerRef.current) {
      currentMarkerRef.current = new window.google.maps.Marker({
        position: currentPosition,
        map: map,
        icon: {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="48" viewBox="0 0 32 48">
              <defs>
                <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
                  <feOffset dx="0" dy="2" result="offsetblur"/>
                  <feComponentTransfer>
                    <feFuncA type="linear" slope="0.3"/>
                  </feComponentTransfer>
                  <feMerge>
                    <feMergeNode/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              <path d="M16 0C9.4 0 4 5.4 4 12c0 8 12 28 12 28s12-20 12-28c0-6.6-5.4-12-12-12z"
                    fill="#EA4335" filter="url(#shadow)"/>
              <circle cx="16" cy="12" r="5" fill="#fff"/>
            </svg>
          `),
          scaledSize: new window.google.maps.Size(32, 48),
          anchor: new window.google.maps.Point(16, 48),
        },
        title: 'Current Position',
        zIndex: 1000,
        animation: window.google.maps.Animation.DROP,
      });
      console.log('Created current position marker');
    } else {
      currentMarkerRef.current.setPosition(currentPosition);
      console.log('Updated current position marker position');
    }

    // Update path coloring based on current position
    if (gpsData?.gpsData && window.google?.maps?.Polyline) {
      const points = gpsData.gpsData;

      // Find current timestamp - currentPosition has lat/lng, need to find corresponding timestamp
      // We'll use the current position to split the path
      let splitIndex = 0;
      let minDistance = Infinity;

      // Find the GPS point closest to current position
      points.forEach((point, index) => {
        const distance = Math.sqrt(
          Math.pow(point.lat - currentPosition.lat, 2) +
          Math.pow(point.lng - currentPosition.lng, 2)
        );
        if (distance < minDistance) {
          minDistance = distance;
          splitIndex = index;
        }
      });

      // Create traveled path (red) - from start to current position
      const traveledCoords = points.slice(0, splitIndex + 1).map(p => ({ lat: p.lat, lng: p.lng }));
      traveledCoords.push(currentPosition); // Add current position for smooth transition

      // Create future path (gray) - from current position to end
      const futureCoords = [currentPosition]; // Start with current position
      futureCoords.push(...points.slice(splitIndex + 1).map(p => ({ lat: p.lat, lng: p.lng })));

      // Update traveled path
      if (traveledPathRef.current) {
        traveledPathRef.current.setPath(traveledCoords);
      } else if (traveledCoords.length > 1) {
        traveledPathRef.current = new window.google.maps.Polyline({
          path: traveledCoords,
          geodesic: true,
          strokeColor: '#EF4444',
          strokeOpacity: 0.8,
          strokeWeight: 4,
          map: map,
          zIndex: 2,
        });
      }

      // Update future path
      if (futurePathRef.current) {
        futurePathRef.current.setPath(futureCoords);
      }

      console.log(`Path split at point ${splitIndex}: traveled=${traveledCoords.length}, future=${futureCoords.length}`);
    }

    return () => {
      if (currentMarkerRef.current) {
        currentMarkerRef.current.setMap(null);
        currentMarkerRef.current = null;
      }
    };
  }, [currentPosition, mapReady, gpsData]);

  if (!apiKey) {
    return (
      <div className="flex-1 min-h-0 w-full p-3">
        <div className="h-full w-full rounded-xl border border-cinema-border bg-cinema-dark flex items-center justify-center text-cinema-muted text-sm">
          Add <code className="text-cinema-silver">VITE_GOOGLE_MAPS_API_KEY</code> to your <code className="text-cinema-silver">.env.local</code> and restart the dev server.
        </div>
      </div>
    );
  }

  if (mapError) {
    return (
      <div className="flex-1 min-h-0 w-full p-3">
        <div className="h-full w-full rounded-xl border border-cinema-border bg-cinema-dark flex flex-col items-center justify-center gap-2 p-4 text-center">
          <p className="text-red-400 text-sm font-medium">Map failed to load</p>
          <p className="text-cinema-muted text-xs max-w-sm">{mapError}</p>
          <p className="text-cinema-muted text-xs">Enable &quot;Maps JavaScript API&quot; and &quot;Geocoding API&quot; in Google Cloud Console, and allow your domain (e.g. localhost) in key restrictions.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 w-full p-3 flex flex-col">
      <div className="flex-1 min-h-0 w-full overflow-hidden rounded-xl border border-cinema-border bg-cinema-dark">
        <div ref={mapRef} className="h-full w-full" />
      </div>
    </div>
  );
}
