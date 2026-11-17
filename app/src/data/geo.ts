// Where places are, for deadhead miles and regions (release 1.41). RunTruck
// has no map service: places are found in this table of freight cities (or,
// failing that, the middle of their state), and miles are straight-line
// distance times a usual road allowance — an estimate, shown as "about".

export type Region = 'West' | 'Southwest' | 'Midwest' | 'Southeast' | 'Northeast';
export const REGIONS: Region[] = ['West', 'Southwest', 'Midwest', 'Southeast', 'Northeast'];

const REGION_OF: Record<string, Region> = {
  WA: 'West', OR: 'West', CA: 'West', NV: 'West', ID: 'West', MT: 'West', WY: 'West', UT: 'West', CO: 'West', AK: 'West', HI: 'West',
  AZ: 'Southwest', NM: 'Southwest', TX: 'Southwest', OK: 'Southwest',
  ND: 'Midwest', SD: 'Midwest', NE: 'Midwest', KS: 'Midwest', MN: 'Midwest', IA: 'Midwest', MO: 'Midwest', WI: 'Midwest', IL: 'Midwest', IN: 'Midwest', MI: 'Midwest', OH: 'Midwest',
  KY: 'Southeast', TN: 'Southeast', NC: 'Southeast', SC: 'Southeast', GA: 'Southeast', FL: 'Southeast', AL: 'Southeast', MS: 'Southeast', AR: 'Southeast', LA: 'Southeast', VA: 'Southeast', WV: 'Southeast',
  ME: 'Northeast', NH: 'Northeast', VT: 'Northeast', MA: 'Northeast', RI: 'Northeast', CT: 'Northeast', NY: 'Northeast', NJ: 'Northeast', PA: 'Northeast', DE: 'Northeast', MD: 'Northeast', DC: 'Northeast',
};

// The middle of each state (for a city not in the table below).
const STATES: Record<string, [number, number]> = {
  AL: [32.8, -86.8], AK: [61.4, -152.3], AZ: [34.3, -111.7], AR: [34.9, -92.4], CA: [37.2, -119.5], CO: [39.0, -105.5], CT: [41.6, -72.7],
  DE: [39.0, -75.5], DC: [38.9, -77.0], FL: [28.6, -82.4], GA: [32.7, -83.4], HI: [20.8, -156.3], ID: [44.4, -114.6], IL: [40.0, -89.2],
  IN: [39.9, -86.3], IA: [42.1, -93.5], KS: [38.5, -98.4], KY: [37.5, -85.3], LA: [31.1, -92.0], ME: [45.4, -69.2], MD: [39.0, -76.8],
  MA: [42.3, -71.8], MI: [44.3, -85.4], MN: [46.3, -94.3], MS: [32.7, -89.7], MO: [38.4, -92.5], MT: [47.0, -109.6], NE: [41.5, -99.8],
  NV: [39.3, -116.6], NH: [43.7, -71.6], NJ: [40.2, -74.7], NM: [34.4, -106.1], NY: [42.9, -75.5], NC: [35.6, -79.4], ND: [47.5, -100.5],
  OH: [40.3, -82.8], OK: [35.6, -97.5], OR: [43.9, -120.6], PA: [40.9, -77.8], RI: [41.7, -71.5], SC: [33.9, -80.9], SD: [44.4, -100.2],
  TN: [35.9, -86.4], TX: [31.5, -99.3], UT: [39.3, -111.7], VT: [44.1, -72.7], VA: [37.5, -78.9], WA: [47.4, -120.5], WV: [38.6, -80.6],
  WI: [44.6, -89.9], WY: [43.0, -107.6],
};

// Freight cities, 'City, ST' → latitude, longitude.
const CITIES: Record<string, [number, number]> = {
  // West coast and California
  'Los Angeles, CA': [34.05, -118.24], 'Long Beach, CA': [33.77, -118.19], 'Ontario, CA': [34.06, -117.65], 'Riverside, CA': [33.95, -117.40],
  'San Bernardino, CA': [34.11, -117.29], 'Fontana, CA': [34.09, -117.44], 'San Diego, CA': [32.72, -117.16], 'Bakersfield, CA': [35.37, -119.02],
  'Fresno, CA': [36.74, -119.79], 'Visalia, CA': [36.33, -119.29], 'Modesto, CA': [37.64, -120.99], 'Stockton, CA': [37.96, -121.29],
  'Turlock, CA': [37.49, -120.85], 'Merced, CA': [37.30, -120.48], 'Tracy, CA': [37.74, -121.43], 'Sacramento, CA': [38.58, -121.49],
  'West Sacramento, CA': [38.58, -121.53], 'Woodland, CA': [38.68, -121.77], 'Oakland, CA': [37.80, -122.27], 'San Francisco, CA': [37.77, -122.42],
  'San Jose, CA': [37.34, -121.89], 'Salinas, CA': [36.68, -121.66], 'Watsonville, CA': [36.91, -121.76], 'Redding, CA': [40.59, -122.39],
  'Chico, CA': [39.73, -121.84], 'Santa Maria, CA': [34.95, -120.44], 'Oxnard, CA': [34.20, -119.18], 'El Centro, CA': [32.79, -115.56],
  'Portland, OR': [45.52, -122.68], 'Salem, OR': [44.94, -123.04], 'Eugene, OR': [44.05, -123.09], 'Medford, OR': [42.33, -122.87],
  'Hermiston, OR': [45.84, -119.29], 'Seattle, WA': [47.61, -122.33], 'Tacoma, WA': [47.25, -122.44], 'Kent, WA': [47.38, -122.23],
  'Spokane, WA': [47.66, -117.43], 'Yakima, WA': [46.60, -120.51], 'Wenatchee, WA': [47.42, -120.31], 'Pasco, WA': [46.24, -119.10],
  // Mountain West
  'Reno, NV': [39.53, -119.81], 'Sparks, NV': [39.53, -119.75], 'Las Vegas, NV': [36.17, -115.14], 'Elko, NV': [40.83, -115.76],
  'Boise, ID': [43.62, -116.20], 'Nampa, ID': [43.58, -116.56], 'Twin Falls, ID': [42.56, -114.46], 'Idaho Falls, ID': [43.49, -112.03],
  'Salt Lake City, UT': [40.76, -111.89], 'Ogden, UT': [41.22, -111.97], 'Denver, CO': [39.74, -104.99], 'Greeley, CO': [40.42, -104.71],
  'Grand Junction, CO': [39.06, -108.55], 'Pueblo, CO': [38.25, -104.61], 'Billings, MT': [45.78, -108.50], 'Missoula, MT': [46.87, -113.99],
  'Cheyenne, WY': [41.14, -104.82], 'Casper, WY': [42.87, -106.31],
  // Southwest
  'Phoenix, AZ': [33.45, -112.07], 'Tucson, AZ': [32.22, -110.97], 'Flagstaff, AZ': [35.20, -111.65], 'Yuma, AZ': [32.69, -114.63],
  'Nogales, AZ': [31.34, -110.93], 'Albuquerque, NM': [35.08, -106.65], 'Las Cruces, NM': [32.32, -106.76], 'El Paso, TX': [31.76, -106.49],
  'Dallas, TX': [32.78, -96.80], 'Fort Worth, TX': [32.76, -97.33], 'Houston, TX': [29.76, -95.37], 'San Antonio, TX': [29.42, -98.49],
  'Austin, TX': [30.27, -97.74], 'Laredo, TX': [27.53, -99.48], 'McAllen, TX': [26.20, -98.23], 'Amarillo, TX': [35.22, -101.83],
  'Lubbock, TX': [33.58, -101.86], 'Midland, TX': [32.00, -102.08], 'Oklahoma City, OK': [35.47, -97.52], 'Tulsa, OK': [36.15, -95.99],
  // Midwest
  'Chicago, IL': [41.88, -87.63], 'Joliet, IL': [41.53, -88.08], 'Rockford, IL': [42.27, -89.09], 'Peoria, IL': [40.69, -89.59],
  'Indianapolis, IN': [39.77, -86.16], 'Fort Wayne, IN': [41.08, -85.14], 'Columbus, OH': [39.96, -83.00], 'Cincinnati, OH': [39.10, -84.51],
  'Cleveland, OH': [41.50, -81.69], 'Toledo, OH': [41.65, -83.54], 'Dayton, OH': [39.76, -84.19], 'Detroit, MI': [42.33, -83.05],
  'Grand Rapids, MI': [42.96, -85.67], 'Lansing, MI': [42.73, -84.56], 'Milwaukee, WI': [43.04, -87.91], 'Madison, WI': [43.07, -89.40],
  'Green Bay, WI': [44.51, -88.02], 'Minneapolis, MN': [44.98, -93.27], 'St. Paul, MN': [44.95, -93.09], 'Des Moines, IA': [41.59, -93.62],
  'Cedar Rapids, IA': [41.98, -91.67], 'Sioux City, IA': [42.50, -96.40], 'Omaha, NE': [41.26, -95.93], 'Lincoln, NE': [40.81, -96.70],
  'Kansas City, MO': [39.10, -94.58], 'St. Louis, MO': [38.63, -90.20], 'Springfield, MO': [37.21, -93.29], 'Joplin, MO': [37.08, -94.51],
  'Wichita, KS': [37.69, -97.34], 'Fargo, ND': [46.88, -96.79], 'Sioux Falls, SD': [43.55, -96.73],
  // Southeast
  'Atlanta, GA': [33.75, -84.39], 'Savannah, GA': [32.08, -81.09], 'Macon, GA': [32.84, -83.63], 'Forest Park, GA': [33.62, -84.37],
  'Nashville, TN': [36.16, -86.78], 'Memphis, TN': [35.15, -90.05], 'Knoxville, TN': [35.96, -83.92], 'Chattanooga, TN': [35.05, -85.31],
  'Charlotte, NC': [35.23, -80.84], 'Raleigh, NC': [35.78, -78.64], 'Greensboro, NC': [36.07, -79.79], 'Columbia, SC': [34.00, -81.03],
  'Charleston, SC': [32.78, -79.93], 'Greenville, SC': [34.85, -82.40], 'Jacksonville, FL': [30.33, -81.66], 'Orlando, FL': [28.54, -81.38],
  'Tampa, FL': [27.95, -82.46], 'Miami, FL': [25.76, -80.19], 'Lakeland, FL': [28.04, -81.95], 'Birmingham, AL': [33.52, -86.80],
  'Montgomery, AL': [32.38, -86.30], 'Mobile, AL': [30.69, -88.04], 'Jackson, MS': [32.30, -90.18], 'Little Rock, AR': [34.75, -92.29],
  'Fort Smith, AR': [35.39, -94.40], 'New Orleans, LA': [29.95, -90.07], 'Baton Rouge, LA': [30.45, -91.15], 'Shreveport, LA': [32.53, -93.75],
  'Louisville, KY': [38.25, -85.76], 'Lexington, KY': [38.04, -84.50], 'Richmond, VA': [37.54, -77.44], 'Norfolk, VA': [36.85, -76.29],
  'Roanoke, VA': [37.27, -79.94], 'Charleston, WV': [38.35, -81.63],
  // Northeast
  'New York, NY': [40.71, -74.01], 'Buffalo, NY': [42.89, -78.88], 'Albany, NY': [42.65, -73.76], 'Syracuse, NY': [43.05, -76.15],
  'Newark, NJ': [40.74, -74.17], 'Edison, NJ': [40.52, -74.41], 'Philadelphia, PA': [39.95, -75.17], 'Pittsburgh, PA': [40.44, -80.00],
  'Harrisburg, PA': [40.27, -76.88], 'Allentown, PA': [40.60, -75.49], 'Baltimore, MD': [39.29, -76.61], 'Hagerstown, MD': [39.64, -77.72],
  'Wilmington, DE': [39.74, -75.55], 'Boston, MA': [42.36, -71.06], 'Worcester, MA': [42.26, -71.80], 'Hartford, CT': [41.76, -72.69],
  'Providence, RI': [41.82, -71.41], 'Portland, ME': [43.66, -70.26], 'Manchester, NH': [42.99, -71.46], 'Burlington, VT': [44.48, -73.21],
};
const CITY_INDEX = new Map(Object.entries(CITIES).map(([k, v]) => [k.toLowerCase(), v]));

export interface Spot { lat: number; lng: number; exact: boolean; state: string }

// 'Fresno, CA', 'Port of Oakland, Berth 22, Oakland, CA 94607' or
// '1599 Maritime St, Oakland, CA' → where it is (null when no state is named).
export function locate(text: string): Spot | null {
  const clean = text.replace(/\s+\d{5}(-\d{4})?\b/g, '').replace(/\s*\(.*?\)\s*/g, ' ').trim();
  const parts = clean.split(',').map((p) => p.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 1; i--) {
    const st = parts[i].toUpperCase();
    if (!STATES[st]) continue;
    const hit = CITY_INDEX.get(`${parts[i - 1]}, ${st}`.toLowerCase());
    if (hit) return { lat: hit[0], lng: hit[1], exact: true, state: st };
    const [lat, lng] = STATES[st];
    return { lat, lng, exact: false, state: st };
  }
  return null;
}

export function regionOf(text: string): Region | null {
  const s = locate(text);
  return s ? REGION_OF[s.state] ?? null : null;
}

// Roads run about a fifth longer than a straight line.
const ROAD = 1.2;

// Estimated road miles between two places (null when either is unknown).
export function roadMiles(a: string, b: string): number | null {
  const p = locate(a);
  const q = locate(b);
  if (!p || !q) return null;
  if (!p.exact && !q.exact && p.state === q.state) return null;
  const rad = Math.PI / 180;
  const dLat = (q.lat - p.lat) * rad;
  const dLng = (q.lng - p.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(p.lat * rad) * Math.cos(q.lat * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 3958.8 * Math.asin(Math.sqrt(h)) * ROAD);
}
