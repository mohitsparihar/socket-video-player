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
  const coreLibRef = useRef(null);
  const markerLibRef = useRef(null);
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
      if (!coreLibRef.current) {
        coreLibRef.current = await importLibrary('core');
      }
      if (!markerLibRef.current) {
        markerLibRef.current = await importLibrary('marker');
      }
      return {
        maps: mapsLibRef.current,
        core: coreLibRef.current,
        marker: markerLibRef.current,
      };
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
        const map = new libs.maps.Map(mapRef.current, {
          center,
          zoom,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        mapInstanceRef.current = map;

        // Only host can manually pan/zoom; members should always follow host map updates.
        if (isAdmin) {
          map.addListener('dragstart', () => {
            setIsAutoCentering(false);
          });

          map.addListener('zoom_changed', () => {
            if (!isProgrammaticRef.current) {
              setIsAutoCentering(false);
            }
          });
        }

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

        if (isMounted) setMapReady(true);
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
      const mapsEvent = coreLibRef.current?.event ?? window.google?.maps?.event;
      if (mapsEvent?.trigger) {
        mapsEvent.trigger(map, 'resize');
      }
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

  // GPS Path Effect - draw path and markers when map is ready and has gpsData
  useEffect(() => {
    if (!mapReady) return;

    const map = mapInstanceRef.current;
    if (!map || !gpsData?.gpsData || !mapsLibRef.current) return;

    const drawOverlays = () => {
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
      if (!points || points.length === 0) return;

      const pathCoordinates = points.map(p => ({ lat: p.lat, lng: p.lng }));

      const PolylineClass = mapsLibRef.current?.Polyline ?? window.google?.maps?.Polyline;
      const LatLngBoundsClass = coreLibRef.current?.LatLngBounds ?? window.google?.maps?.LatLngBounds;
      const MarkerClass = markerLibRef.current?.Marker ?? window.google?.maps?.Marker;
      const mapsEvent = coreLibRef.current?.event ?? window.google?.maps?.event;
      const SymbolPathEnum = coreLibRef.current?.SymbolPath ?? window.google?.maps?.SymbolPath;

      if (LatLngBoundsClass) {
        const bounds = new LatLngBoundsClass();
        pathCoordinates.forEach(coord => bounds.extend(coord));

        map.fitBounds(bounds, {
          top: 50,
          right: 50,
          bottom: 50,
          left: 50,
        });

        if (mapsEvent) {
          mapsEvent.addListenerOnce(map, 'bounds_changed', () => {
            const currentZoom = map.getZoom();
            if (currentZoom > 18) {
              map.setZoom(18);
            }
          });
        }
      }

      // Draw path only when we have 2+ points (polyline needs 2+ points to be visible)
      if (PolylineClass && pathCoordinates.length >= 2) {
        futurePathRef.current = new PolylineClass({
          path: pathCoordinates,
          geodesic: true,
          strokeColor: '#4285F4',
          strokeOpacity: 0.9,
          strokeWeight: 4,
          map: map,
        });
      }

      if (MarkerClass && SymbolPathEnum) {
        points.forEach((point, index) => {
          const timeInSeconds = point.timestamp ?? (point.timeMs ? point.timeMs / 1000 : 0);
          const marker = new MarkerClass({
            position: { lat: point.lat, lng: point.lng },
            map: map,
            icon: {
              path: SymbolPathEnum.CIRCLE,
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

    };

    // Draw immediately, then once more on map 'idle' to ensure overlays render
    // (members may have 0-sized map container initially when overlay first appears)
    drawOverlays();
    const mapsEvent = mapsLibRef.current?.event ?? window.google?.maps?.event;
    let idleListener = null;
    if (mapsEvent) {
      idleListener = mapsEvent.addListenerOnce(map, 'idle', drawOverlays);
    }

    return () => {
      if (idleListener && typeof idleListener.remove === 'function') {
        idleListener.remove();
      }
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

    const MarkerClass = markerLibRef.current?.Marker ?? window.google?.maps?.Marker;
    const PolylineClass = mapsLibRef.current?.Polyline ?? window.google?.maps?.Polyline;
    if (!MarkerClass) return;

    if (!currentMarkerRef.current) {
      currentMarkerRef.current = new MarkerClass({
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
          scaledSize: new (coreLibRef.current?.Size ?? window.google?.maps?.Size)(32, 48),
          anchor: new (coreLibRef.current?.Point ?? window.google?.maps?.Point)(16, 48),
        },
        title: 'Current Position',
        zIndex: 1000,
      });
    } else {
      currentMarkerRef.current.setPosition(currentPosition);
    }

    if (gpsData?.gpsData && PolylineClass) {
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
        traveledPathRef.current = new PolylineClass({
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
      } else if (futureCoords.length >= 2) {
        futurePathRef.current = new PolylineClass({
          path: futureCoords,
          geodesic: true,
          strokeColor: '#9CA3AF',
          strokeOpacity: 0.8,
          strokeWeight: 3,
          map: map,
        });
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
