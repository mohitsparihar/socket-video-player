import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Locate } from 'lucide-react';

export default function MapPanel({
  center = { lat: 20.5937, lng: 78.9629 },
  zoom = 5,
  isAdmin = false,
  onUpdate,
  gpsData = null,
  currentPosition = null,
}) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const lastSentRef = useRef({ center, zoom });
  const isProgrammaticRef = useRef(false);
  const [isAutoCentering, setIsAutoCentering] = useState(true);
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

        // Detect user interaction to stop auto-centering
        map.addListener('dragstart', () => {
          setIsAutoCentering(false);
        });

        // Detect manual zoom
        map.addListener('zoom_changed', () => {
          if (!isProgrammaticRef.current) {
            setIsAutoCentering(false);
          }
        });

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

  // Resize Effect
  useEffect(() => {
    const el = mapRef.current;
    const map = mapInstanceRef.current;
    if (!el || !map) return;
    const triggerResize = () => {
      try {
        map.resize();
      } catch (_) { }
    };
    const ro = new ResizeObserver(triggerResize);
    ro.observe(el);
    triggerResize();
    return () => ro.disconnect();
  }, [mapReady]);

  // Center/Zoom Effect
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!isAutoCentering) return;

    // Zoom
    if (map.getZoom() !== zoom) {
      isProgrammaticRef.current = true;
      map.setZoom(zoom);
      setTimeout(() => { isProgrammaticRef.current = false; }, 0);
    }

    // Center
    const current = map.getCenter();
    if (
      !current ||
      Math.abs(current.lat() - center.lat) > 0.00001 ||
      Math.abs(current.lng() - center.lng) > 0.00001
    ) {
      isProgrammaticRef.current = true;
      map.setCenter(center);
      setTimeout(() => { isProgrammaticRef.current = false; }, 0);
    }
  }, [center, zoom, isAutoCentering]);

  // GPS Path Effect
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

    const points = gpsData.gpsData;
    if (!points || points.length === 0) {
      console.log('No GPS points found');
      return;
    }

    const pathCoordinates = points.map(p => ({ lat: p.lat, lng: p.lng }));

    if (window.google?.maps?.LatLngBounds) {
      const bounds = new window.google.maps.LatLngBounds();
      pathCoordinates.forEach(coord => bounds.extend(coord));

      map.fitBounds(bounds, {
        top: 50,
        right: 50,
        bottom: 50,
        left: 50,
      });

      window.google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
        const currentZoom = map.getZoom();
        if (currentZoom > 18) {
          map.setZoom(18);
        }
      });
    }

    if (window.google?.maps?.Polyline) {
      futurePathRef.current = new window.google.maps.Polyline({
        path: pathCoordinates,
        geodesic: true,
        strokeColor: '#9CA3AF',
        strokeOpacity: 0.5,
        strokeWeight: 3,
        map: map,
      });
    }

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

  // Current Position Effect
  useEffect(() => {
    if (!mapReady) return;
    const map = mapInstanceRef.current;
    if (!currentPosition) {
      if (currentMarkerRef.current) {
        currentMarkerRef.current.setMap(null);
        currentMarkerRef.current = null;
      }
      return;
    }
    if (!map || !mapsLibRef.current) return;

    if (!window.google?.maps?.Marker) return;

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
      });
    } else {
      currentMarkerRef.current.setPosition(currentPosition);
    }

    if (gpsData?.gpsData && window.google?.maps?.Polyline) {
      const points = gpsData.gpsData;
      let minDistance = Infinity;
      let splitIndex = 0;
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

      const traveledCoords = points.slice(0, splitIndex + 1).map(p => ({ lat: p.lat, lng: p.lng }));
      traveledCoords.push(currentPosition);

      const futureCoords = [currentPosition];
      futureCoords.push(...points.slice(splitIndex + 1).map(p => ({ lat: p.lat, lng: p.lng })));

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

      if (futurePathRef.current) {
        futurePathRef.current.setPath(futureCoords);
      }
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
        <div className="h-full w-full rounded-xl border border-light-border bg-light-surface flex items-center justify-center text-light-muted text-sm">
          Add <code className="text-light-text">VITE_GOOGLE_MAPS_API_KEY</code> to your <code className="text-light-text">.env.local</code> and restart the dev server.
        </div>
      </div>
    );
  }

  if (mapError) {
    return (
      <div className="flex-1 min-h-0 w-full p-3">
        <div className="h-full w-full rounded-xl border border-light-border bg-light-surface flex flex-col items-center justify-center gap-2 p-4 text-center">
          <p className="text-red-400 text-sm font-medium">Map failed to load</p>
          <p className="text-light-muted text-xs max-w-sm">{mapError}</p>
          <p className="text-light-muted text-xs">Enable &quot;Maps JavaScript API&quot; and &quot;Geocoding API&quot; in Google Cloud Console, and allow your domain (e.g. localhost) in key restrictions.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 w-full p-1 flex flex-col">
      <div className="flex-1 min-h-0 w-full overflow-hidden rounded-xl border border-light-border bg-light-surface relative">
        <div ref={mapRef} className="h-full w-full min-h-[200px]" />

        {currentPosition && !isAutoCentering && (
          <button
            type="button"
            onClick={() => {
              const map = mapInstanceRef.current;
              if (map && currentPosition) {
                map.setCenter(currentPosition);
                map.setZoom(20);
                setIsAutoCentering(true);
                onUpdate?.({ mapCenter: currentPosition, mapZoom: 20 });
              }
            }}
            className="absolute bottom-6 left-4 p-2 bg-white rounded-lg shadow-md border border-light-border text-light-text hover:bg-light-surface active:bg-gray-100 transition-colors z-10 flex items-center gap-2"
            title="Recenter Map"
          >
            <Locate className="w-4 h-4 text-light-purple" />
            <span className="text-xs font-medium hidden sm:inline">Recenter</span>
          </button>
        )}
      </div>
    </div>
  );
}
