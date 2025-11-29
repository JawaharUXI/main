/**
 * RF Link Planner - RF Utility Functions
 * Contains calculations for distance and Fresnel zone
 */

const SPEED_OF_LIGHT = 3e8; // meters per second

/**
 * Calculate the Haversine distance between two lat/lng coordinates
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in meters
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371e3; // Earth radius in meters

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(dLambda / 2) *
      Math.sin(dLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Compute the maximum Fresnel zone radius at the midpoint of a link
 * @param {number} distanceMeters - Total link distance in meters
 * @param {number} frequencyGHz - Frequency in GHz
 * @returns {number} Maximum Fresnel radius in meters
 */
function computeFresnelMaxRadius(distanceMeters, frequencyGHz) {
  if (!distanceMeters || !frequencyGHz) return 0;
  const frequencyHz = frequencyGHz * 1e9;
  const lambda = SPEED_OF_LIGHT / frequencyHz;
  // Max radius at mid-link where d1 = d2 = D/2
  return Math.sqrt((lambda * distanceMeters) / 4);
}

/**
 * Generate interpolated points along a link between two towers
 * @param {Object} tower1 - First tower with lat/lng
 * @param {Object} tower2 - Second tower with lat/lng
 * @param {number} numPoints - Number of points to generate
 * @returns {Array} Array of [lat, lng] points
 */
function generateLinkPoints(tower1, tower2, numPoints = 30) {
  const points = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const lat = tower1.lat + t * (tower2.lat - tower1.lat);
    const lng = tower1.lng + t * (tower2.lng - tower1.lng);
    points.push([lat, lng]);
  }
  return points;
}

/**
 * Calculate Fresnel zone radius at each point along a link
 * @param {Array} points - Array of [lat, lng] points
 * @param {Object} tower1 - First tower
 * @param {Object} tower2 - Second tower
 * @param {number} frequencyGHz - Frequency in GHz
 * @returns {Array} Array of radii in meters
 */
function calculateFresnelRadii(points, tower1, tower2, frequencyGHz) {
  const totalDistance = haversineDistance(tower1.lat, tower1.lng, tower2.lat, tower2.lng);
  const frequencyHz = frequencyGHz * 1e9;
  const lambda = SPEED_OF_LIGHT / frequencyHz;

  return points.map((point, index) => {
    const t = index / (points.length - 1);
    const d1 = t * totalDistance;
    const d2 = (1 - t) * totalDistance;
    
    if (d1 === 0 || d2 === 0) return 0;
    
    // First Fresnel zone radius formula
    const radius = Math.sqrt((lambda * d1 * d2) / (d1 + d2));
    return radius;
  });
}

/**
 * Convert meters to approximate degrees for visualization
 * @param {number} meters - Distance in meters
 * @param {number} latitude - Reference latitude
 * @returns {Object} Object with latDegrees and lngDegrees
 */
function metersToDegreesApprox(meters, latitude) {
  const latDegrees = meters / 111320; // meters per degree of latitude
  const lngDegrees = meters / (111320 * Math.cos(latitude * Math.PI / 180));
  return { latDegrees, lngDegrees };
}

/**
 * Generate a Fresnel zone polygon for visualization
 * @param {Object} tower1 - First tower
 * @param {Object} tower2 - Second tower
 * @param {number} frequency - Frequency in GHz
 * @param {number} scaleFactor - Optional scale factor for visualization (default: 1)
 * @returns {Array} Array of [lat, lng] polygon points
 */
function generateFresnelPolygon(tower1, tower2, frequency, scaleFactor = 1) {
  const numPoints = 50; // More points for smoother ellipse
  const linkPoints = generateLinkPoints(tower1, tower2, numPoints);
  const fresnelRadii = calculateFresnelRadii(linkPoints, tower1, tower2, frequency);

  // Calculate total distance and max radius for logging
  const totalDistance = haversineDistance(tower1.lat, tower1.lng, tower2.lat, tower2.lng);
  const maxRadius = Math.max(...fresnelRadii);

  console.log('Fresnel polygon generation:', {
    totalDistance: totalDistance,
    maxRadius: maxRadius,
    frequency: frequency,
    scaleFactor: scaleFactor
  });

  // Calculate the bearing/angle of the link
  const dLat = tower2.lat - tower1.lat;
  const dLng = tower2.lng - tower1.lng;
  const linkAngle = Math.atan2(dLng, dLat); // Angle in radians

  // Perpendicular angle (90 degrees rotated)
  const perpAngle = linkAngle + Math.PI / 2;

  const upperPoints = [];
  const lowerPoints = [];

  linkPoints.forEach((point, index) => {
    const radius = fresnelRadii[index] * scaleFactor;
    const [lat, lng] = point;

    if (radius === 0) {
      upperPoints.push([lat, lng]);
      lowerPoints.push([lat, lng]);
      return;
    }

    // Convert radius to degrees
    const { latDegrees, lngDegrees } = metersToDegreesApprox(radius, lat);

    // Calculate offset in perpendicular direction
    const offsetLat = Math.cos(perpAngle) * latDegrees;
    const offsetLng = Math.sin(perpAngle) * lngDegrees;

    upperPoints.push([lat + offsetLat, lng + offsetLng]);
    lowerPoints.push([lat - offsetLat, lng - offsetLng]);
  });

  // Combine points to form a closed polygon (upper path + reversed lower path)
  const polygon = [...upperPoints, ...lowerPoints.reverse()];

  console.log('Generated polygon with', polygon.length, 'points');

  return polygon;
}

/**
 * Generate a unique ID
 * @returns {string} UUID-like string
 */
function generateId() {
  return 'xxxx-xxxx-xxxx-xxxx'.replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16)
  );
}

// Ensure functions are globally accessible
window.haversineDistance = haversineDistance;
window.computeFresnelMaxRadius = computeFresnelMaxRadius;
window.generateLinkPoints = generateLinkPoints;
window.calculateFresnelRadii = calculateFresnelRadii;
window.metersToDegreesApprox = metersToDegreesApprox;
window.generateFresnelPolygon = generateFresnelPolygon;
window.generateId = generateId;

console.log('RF utility functions loaded successfully');
