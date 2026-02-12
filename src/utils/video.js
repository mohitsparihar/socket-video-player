const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const CAMERA_UPLOADS_URL =
    import.meta.env.VITE_CAMERA_UPLOADS_URL ||
    'https://beapis-in.staging.geoiq.ai/bdapp/stg/v1/bd/getCameraAppUploads';

/**
 * Fetch video list from GeoIQ Camera App Uploads API (POST with Bearer token)
 * @param {string} [accessToken] - Bearer token. Uses VITE_BD_ACCESS_TOKEN if not provided.
 * @returns {Promise<unknown>} API response (parsed JSON)
 */
export async function getCameraAppUploads(accessToken) {
    const token = accessToken || import.meta.env.VITE_BD_ACCESS_TOKEN;
    if (!token) {
        throw new Error('Access token required for getCameraAppUploads (set VITE_BD_ACCESS_TOKEN or pass token)');
    }
    const response = await fetch(CAMERA_UPLOADS_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: '',
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`getCameraAppUploads failed: ${response.status} ${response.statusText}${text ? ` - ${text}` : ''}`);
    }
    return response.json();
}

/**
 * Normalize camera app API response (shape: { list: [...] }) to video list for UI.
 * Each item: { id, filename, public_url, gps_json_url, hasGPS, is360 }
 */
function normalizeCameraUploads(raw) {
    if (!raw || typeof raw !== 'object') return [];
    const list = raw.list ?? raw.data ?? raw.uploads ?? (Array.isArray(raw) ? raw : []);
    if (!Array.isArray(list)) return [];
    return list.map((item) => ({
        id: item.id ?? item.file_name ?? item.public_url ?? `video-${Math.random().toString(36).slice(2)}`,
        filename: item.file_name ?? item.filename ?? item.name ?? 'Video',
        public_url: item.public_url ?? null,
        gps_json_url: item.gps_json_url ?? null,
        hasGPS: Boolean(item.gps_json_url),
        is360: true, // camera app uploads are 360
    }));
}

/**
 * Fetch video list from GeoIQ Camera App API (frontend). Use this for the video library.
 * Requires VITE_BD_ACCESS_TOKEN (or pass accessToken).
 */
export async function getVideoListFromCameraApi(accessToken) {
    const raw = await getCameraAppUploads(accessToken);
    return normalizeCameraUploads(raw);
}

/**
 * Fetch list of available videos (local API)
 */
export async function getVideoList() {
    try {
        const response = await fetch(`${API_BASE}/api/videos`);
        if (!response.ok) throw new Error('Failed to fetch videos');
        return await response.json();
    } catch (error) {
        console.error('Error fetching video list:', error);
        return [];
    }
}

/**
 * Get video stream URL
 */
export function getVideoUrl(videoId) {
    return `${API_BASE}/api/videos/${videoId}/stream`;
}

/**
 * Upload video file
 */
export async function uploadVideo(videoFile, gpsFile = null) {
    try {
        const formData = new FormData();
        formData.append('video', videoFile);
        if (gpsFile) {
            formData.append('gps', gpsFile);
        }

        const response = await fetch(`${API_BASE}/api/videos/upload`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) throw new Error('Failed to upload video');
        return await response.json();
    } catch (error) {
        console.error('Error uploading video:', error);
        throw error;
    }
}

/**
 * Delete video
 */
export async function deleteVideo(videoId) {
    try {
        const response = await fetch(`${API_BASE}/api/videos/${videoId}`, {
            method: 'DELETE',
        });

        if (!response.ok) throw new Error('Failed to delete video');
        return await response.json();
    } catch (error) {
        console.error('Error deleting video:', error);
        throw error;
    }
}

/**
 * Fetch GPS data for a video (local API)
 */
export async function getGPSData(videoId) {
    try {
        const response = await fetch(`${API_BASE}/api/videos/${videoId}/gps`);
        if (!response.ok) {
            if (response.status === 404) return null;
            throw new Error('Failed to fetch GPS data');
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching GPS data:', error);
        return null;
    }
}

/**
 * Fetch GPS data from a JSON URL (e.g. camera app gps_json_url).
 * Returns same shape as getGPSData: { gpsData: [{ timestamp, lat, lng }, ...] } or null.
 */
export async function getGPSDataFromUrl(gpsJsonUrl) {
    if (!gpsJsonUrl || typeof gpsJsonUrl !== 'string') return null;
    try {
        const response = await fetch(gpsJsonUrl);
        if (!response.ok) return null;
        const data = await response.json();
        if (!data || typeof data !== 'object') return null;
        const points = Array.isArray(data) ? data : (data.gpsData ?? data.points ?? data.track ?? []);
        if (!Array.isArray(points) || points.length === 0) return null;

        // Normalize GPS points: convert timeMs to timestamp (seconds) if needed
        const normalizedPoints = points.map(point => {
            if (point.timeMs !== undefined && point.timestamp === undefined) {
                return {
                    ...point,
                    timestamp: point.timeMs / 1000,
                };
            }
            return point;
        });

        return { gpsData: normalizedPoints };
    } catch (error) {
        console.error('Error fetching GPS from URL:', error);
        return null;
    }
}

/**
 * Interpolate GPS position at a specific timestamp
 * @param {Array} gpsData - Array of {timestamp, lat, lng} objects
 * @param {number} currentTime - Current video timestamp in seconds
 * @returns {Object|null} - {lat, lng} or null if no data
 */
export function interpolateGPSPosition(gpsData, currentTime) {
    if (!gpsData || gpsData.length === 0) return null;

    // Find the two closest GPS points
    let before = null;
    let after = null;

    for (let i = 0; i < gpsData.length; i++) {
        const point = gpsData[i];

        if (point.timestamp <= currentTime) {
            before = point;
        }

        if (point.timestamp >= currentTime && !after) {
            after = point;
            break;
        }
    }

    // If we only have one point or we're before the first point
    if (!before && after) return { lat: after.lat, lng: after.lng };
    if (before && !after) return { lat: before.lat, lng: before.lng };
    if (!before && !after) return null;

    // If we have the exact timestamp
    if (before.timestamp === currentTime) return { lat: before.lat, lng: before.lng };
    if (after.timestamp === currentTime) return { lat: after.lat, lng: after.lng };

    // Interpolate between the two points
    const timeDiff = after.timestamp - before.timestamp;
    const ratio = (currentTime - before.timestamp) / timeDiff;

    return {
        lat: before.lat + (after.lat - before.lat) * ratio,
        lng: before.lng + (after.lng - before.lng) * ratio,
    };
}

/**
 * Validate GPS data format
 */
export function validateGPSData(data) {
    if (!data || typeof data !== 'object') return false;
    if (!Array.isArray(data.gpsData)) return false;

    return data.gpsData.every(point =>
        typeof point.timestamp === 'number' &&
        typeof point.lat === 'number' &&
        typeof point.lng === 'number' &&
        point.lat >= -90 && point.lat <= 90 &&
        point.lng >= -180 && point.lng <= 180
    );
}
