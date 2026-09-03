// Weather via Open-Meteo — no API key, no env var, no serverless route. The
// endpoint is CORS-enabled so the browser calls it directly; coordinates live in
// synced state so it costs one request per load. Failure is silent: the slot
// just stays empty rather than blocking or shouting.

import { state, subscribe } from './store.js';

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const REFRESH_MS = 15 * 60_000;

// WMO code → plain description. Written as ranges because the codes are grouped
// by phenomenon and intensity.
const CONDITIONS = [
  [[0], 'clear'], [[1], 'mainly clear'], [[2], 'partly cloudy'], [[3], 'overcast'],
  [[45, 48], 'fog'],
  [[51, 53, 55], 'drizzle'], [[56, 57], 'freezing drizzle'],
  [[61, 63, 65], 'rain'], [[66, 67], 'freezing rain'],
  [[71, 73, 75, 77], 'snow'],
  [[80, 81, 82], 'showers'], [[85, 86], 'snow showers'],
  [[95], 'thunderstorm'], [[96, 99], 'thunderstorm with hail'],
];

export function describeCode(code) {
  const hit = CONDITIONS.find(([codes]) => codes.includes(code));
  return hit ? hit[1] : '';
}

export async function geocode(query) {
  const url = `${GEOCODE}?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('geocode failed');
  const body = await r.json();
  return (body.results || []).map(p => ({
    label: [p.name, p.admin1, p.country_code].filter(Boolean).join(', '),
    name: p.name,
    lat: p.latitude,
    lon: p.longitude,
  }));
}

let el = null;
let request = null;
let weatherSignature = '';

function signature() {
  const { lat, lon, label } = state.weather || {};
  return `${lat ?? ''}|${lon ?? ''}|${label || ''}`;
}

export function mountWeather(node) {
  el = node;
  weatherSignature = signature();
  refreshWeather();
  subscribe(() => {
    const next = signature();
    if (next === weatherSignature) return;
    weatherSignature = next;
    refreshWeather();
  });
  setInterval(refreshWeather, REFRESH_MS);
}

export async function refreshWeather() {
  if (!el) return;
  if (request) request.abort();
  const controller = new AbortController();
  request = controller;
  const { lat, lon, label } = state.weather || {};

  if (typeof lat !== 'number' || typeof lon !== 'number') {
    el.textContent = '';
    request = null;
    return;
  }

  try {
    const url = `${FORECAST}?latitude=${lat}&longitude=${lon}`
      + '&current=temperature_2m,weather_code&timezone=auto';
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) throw new Error('forecast failed');
    const { current } = await r.json();
    if (!current) throw new Error('no current block');

    const temp = Math.round(current.temperature_2m);
    const desc = describeCode(current.weather_code);
    if (request !== controller) return;
    el.innerHTML = '';
    el.append(
      span('weather-place', label || ''),
      span('weather-temp', `${temp}°`),
      span('weather-desc', desc),
    );
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    console.warn('weather unavailable', e);
    if (request === controller) el.textContent = '';
  } finally {
    if (request === controller) request = null;
  }
}

function span(cls, text) {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
}
