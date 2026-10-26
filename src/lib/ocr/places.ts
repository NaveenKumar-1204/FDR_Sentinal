// Indian cities and district towns used to validate / correct place names in branch names.
// A production system would use RBI's IFSC master, which gives the exact branch and city for every IFSC.
import { levenshtein } from '../similarity';

export const PLACES = [
  'Agra', 'Ahmedabad', 'Ajmer', 'Aligarh', 'Allahabad', 'Alwar', 'Ambala', 'Amravati', 'Amritsar', 'Anand', 'Anantapur', 'Aurangabad',
  'Bareilly', 'Belagavi', 'Bengaluru', 'Bhagalpur', 'Bharuch', 'Bhavnagar', 'Bhilai', 'Bhopal', 'Bhubaneswar', 'Bikaner', 'Bilaspur',
  'Bokaro', 'Chandigarh', 'Chennai', 'Coimbatore', 'Cuddalore', 'Cuttack', 'Darbhanga', 'Davanagere', 'Dehradun', 'Delhi', 'Dhanbad',
  'Dharwad', 'Dindigul', 'Durgapur', 'Eluru', 'Erode', 'Faridabad', 'Gaya', 'Ghaziabad', 'Gorakhpur', 'Gulbarga', 'Guntur', 'Gurugram',
  'Guwahati', 'Gwalior', 'Haridwar', 'Hisar', 'Hosur', 'Howrah', 'Hubballi', 'Hyderabad', 'Imphal', 'Indore', 'Itanagar', 'Jabalpur',
  'Jaipur', 'Jalandhar', 'Jalgaon', 'Jammu', 'Jamnagar', 'Jamshedpur', 'Jhansi', 'Jodhpur', 'Junagadh', 'Kakinada', 'Kalyan', 'Kanchipuram',
  'Kannur', 'Kanpur', 'Karimnagar', 'Karnal', 'Karur', 'Kochi', 'Kolhapur', 'Kolkata', 'Kollam', 'Kota', 'Kottayam', 'Kozhikode', 'Kumbakonam',
  'Kurnool', 'Latur', 'Lucknow', 'Ludhiana', 'Madurai', 'Malappuram', 'Mangaluru', 'Mathura', 'Meerut', 'Moradabad', 'Mumbai', 'Muzaffarpur',
  'Mysuru', 'Nagercoil', 'Nagpur', 'Nanded', 'Nashik', 'Navsari', 'Nellore', 'Noida', 'Ongole', 'Palakkad', 'Panaji', 'Panipat', 'Patiala',
  'Patna', 'Puducherry', 'Pune', 'Raichur', 'Raipur', 'Rajahmundry', 'Rajkot', 'Ranchi', 'Ratnagiri', 'Rohtak', 'Rourkela', 'Sagar',
  'Saharanpur', 'Salem', 'Sambalpur', 'Sangli', 'Satara', 'Shillong', 'Shimla', 'Shivamogga', 'Siliguri', 'Solapur', 'Srinagar', 'Surat',
  'Thanjavur', 'Thiruvananthapuram', 'Thoothukudi', 'Thrissur', 'Tiruchirappalli', 'Tirunelveli', 'Tirupati', 'Tiruppur', 'Tiruvannamalai',
  'Udaipur', 'Udupi', 'Ujjain', 'Vadodara', 'Varanasi', 'Vellore', 'Vijayawada', 'Visakhapatnam', 'Warangal', 'Yavatmal',
];

const LOWER = PLACES.map((p) => p.toLowerCase());

/** Ordinary address words that are never "corrected" into a city ("Nagar" must not become "Sagar"). */
const ADDRESS_WORDS = new Set(['nagar', 'road', 'main', 'town', 'city', 'bazaar', 'station', 'colony', 'estate', 'lines', 'civil', 'gandhi',
  'market', 'college', 'branch', 'cantonment', 'industrial', 'collectorate', 'street', 'salai', 'puram', 'ganj', 'chowk', 'marg', 'layout',
  'extension', 'circle', 'square', 'complex', 'sector', 'phase', 'block', 'bazar', 'nagara', 'palayam', 'pettai']);

/**
 * Finds place names in a branch string and corrects single-word OCR slips ("Tiruchirappallt" → "Tiruchirappalli").
 * Only corrects when exactly one place is within 1 edit (≤7 letters) or 2 edits (longer words).
 */
export function correctPlaces(text: string): { text: string; found: string[]; corrected: string[] } {
  const found: string[] = [], corrected: string[] = [];
  const out = text.replace(/[A-Za-z]{5,}/g, (word) => {
    const w = word.toLowerCase();
    if (ADDRESS_WORDS.has(w)) return word;
    const exact = LOWER.indexOf(w);
    if (exact >= 0) { found.push(PLACES[exact]); return word; }
    if (w.length < 6) return word;
    const allowed = w.length >= 9 ? 2 : 1;
    const near = LOWER.map((p, i) => ({ i, d: levenshtein(w, p) })).filter((x) => x.d <= allowed);
    if (near.length !== 1) return word;
    const place = PLACES[near[0].i];
    found.push(place);
    corrected.push(`${word} → ${place}`);
    return word === word.toUpperCase() ? place.toUpperCase() : place;
  });
  return { text: out, found, corrected };
}
