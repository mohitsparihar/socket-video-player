import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { useCallback, useEffect, useRef, useState } from 'react';

export default function MapPanel({
  center = { lat: 40.758, lng: -73.9855 },
  zoom = 13,
  isAdmin = false,
  onUpdate,
}) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const lastSentRef = useRef({ center, zoom });
  const [queryInput, setQueryInput] = useState('');
  const [searchError, setSearchError] = useState('');

  const mapsLibRef = useRef(null);
  const geocoderRef = useRef(null);

  const loadMaps = useCallback(async () => {
    if (!apiKey) return null;
    setOptions({ apiKey, version: 'weekly' });
    if (!mapsLibRef.current) {
      const { Map } = await importLibrary('maps');
      mapsLibRef.current = { Map };
    }
    return mapsLibRef.current;
  }, [apiKey]);

  useEffect(() => {
    if (!apiKey || !mapRef.current) return;
    let isMounted = true;

    (async () => {
      const libs = await loadMaps();
      if (!isMounted || !libs || mapInstanceRef.current || !mapRef.current) return;
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

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!isAdmin || !queryInput || !mapInstanceRef.current) return;
    setSearchError('');
    if (!geocoderRef.current) {
      try {
        const { Geocoder } = await importLibrary('geocoding');
        geocoderRef.current = new Geocoder();
      } catch (err) {
        if (window.google?.maps?.Geocoder) {
          geocoderRef.current = new window.google.maps.Geocoder();
        }
      }
    }
    if (!geocoderRef.current) {
      setSearchError('Geocoding is unavailable for this API key.');
      return;
    }
    geocoderRef.current.geocode({ address: queryInput }, (results, status) => {
      if (status !== 'OK' || !results?.[0]) {
        setSearchError('Location not found.');
        return;
      }
      const location = results[0].geometry.location;
      const next = { lat: location.lat(), lng: location.lng() };
      const z = mapInstanceRef.current.getZoom() ?? zoom;
      mapInstanceRef.current.setCenter(next);
      onUpdate?.({ mapCenter: next, mapZoom: z });
    });
  };

  if (!apiKey) {
    return (
      <div className="flex-1 min-h-0 w-full p-3">
        <div className="h-full w-full rounded-xl border border-cinema-border bg-cinema-dark flex items-center justify-center text-cinema-muted text-sm">
          Add `VITE_GOOGLE_MAPS_API_KEY` to enable the map.
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 w-full p-3 flex flex-col gap-3">
      {isAdmin && (
        <form onSubmit={handleSearch} className="space-y-2">
          <label className="text-xs text-cinema-muted">Search location</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Search location"
              className="flex-1 px-3 py-2 rounded-lg bg-cinema-dark border border-cinema-border text-white placeholder-cinema-muted text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50"
            />
            <button
              type="submit"
              className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors"
            >
              Go
            </button>
          </div>
          {searchError && (
            <div className="text-xs text-red-400">{searchError}</div>
          )}
          <div className="flex items-center gap-3">
            <label className="text-xs text-cinema-muted">Zoom</label>
            <input
              type="range"
              min="2"
              max="18"
              value={zoom}
              onChange={(e) => onUpdate?.({ mapCenter: center, mapZoom: Number(e.target.value) })}
              className="flex-1"
            />
            <span className="text-xs text-cinema-silver w-6 text-right">{zoom}</span>
          </div>
        </form>
      )}
      <div className="flex-1 min-h-0 w-full overflow-hidden rounded-xl border border-cinema-border bg-cinema-dark">
        <div ref={mapRef} className="h-full w-full" />
      </div>
    </div>
  );
}
