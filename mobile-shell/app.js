import { narrationPrototype } from './narration-prototype.js';

const samplePackage = {
  packageVersion: 'journey-package-v1',
  journeyId: 'demo-journey',
  generatedAt: new Date().toISOString(),
  language: 'en',
  interests: ['history', 'culture'],
  manifest: {
    journeyId: 'demo-journey',
    generatedAt: new Date().toISOString(),
    language: 'en',
    route: {
      type: 'LineString',
      coordinates: [
        [77.1, 28.7],
        [77.5, 28.75],
        [77.9, 28.9],
        [78.2, 29.1],
      ],
    },
    interests: ['history', 'culture'],
    storyCount: 2,
    stories: [
      {
        id: 'story-1',
        title: 'Loni Fort is tied to Timur\'s invasion',
        category: 'history',
        tags: ['history', 'fort'],
        narration: {
          headline: 'Loni Fort is tied to Timur\'s invasion',
          cue: 'A short historical note on the route.',
          summary: 'Loni Fort is tied to Timur\'s invasion. A short historical note on the route. The fort sits in a strategically important stretch along this corridor.',
        },
      },
      {
        id: 'story-2',
        title: 'Bharatpur Market',
        category: 'culture',
        tags: ['culture', 'market'],
        narration: {
          headline: 'Bharatpur Market',
          cue: 'A quick local culture stop.',
          summary: 'Bharatpur Market. A quick local culture stop. This market area reflects the everyday craft and trade traditions of the region.',
        },
      },
    ],
    assets: [
      { kind: 'route', name: 'route.geojson', path: 'route.geojson' },
      { kind: 'stories', name: 'stories.json', path: 'stories.json' },
      { kind: 'manifest', name: 'manifest.json', path: 'manifest.json' },
    ],
  },
  files: [
    { name: 'route.geojson', path: 'route.geojson', kind: 'route' },
    { name: 'stories.json', path: 'stories.json', kind: 'stories' },
    { name: 'manifest.json', path: 'manifest.json', kind: 'manifest' },
  ],
};

const state = {
  selectedIndex: 0,
  progress: 0,
  playbackTimer: null,
  playbackStatus: 'paused',
  isLoading: false,
  narrationLanguage: 'en',
  // Phase 6 — real-world driving prototype (GPS-based story triggering).
  drivingMode: 'simulated', // 'simulated' (progress slider / Play route) or 'gps' (real position)
  gpsWatchId: null,
  gpsTriggeredIndex: null,
  gpsTriggeredStoryIds: new Set(),
};

function readPackage() {
  const journeyId = document.getElementById('journeyIdInput').value.trim();
  if (!journeyId) {
    return Promise.resolve(samplePackage);
  }

  const apiBase = document.getElementById('apiBaseInput').value.trim();
  const simulationBody = {
    radiusMeters: 10000,
    assumedSpeedKmh: 60,
    decisionWindowMinutes: 1,
    interests: ['history', 'culture', 'nature'],
    language: 'en',
    includeStepDiagnostics: true,
  };

  return fetch(`${apiBase}/v1/journeys/${journeyId}/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(simulationBody),
  })
    .then(async response => {
      if (response.ok) {
        return response.json();
      }
      return fetch(`${apiBase}/v1/journeys/${journeyId}/package`)
        .then(async packageResponse => {
          if (!packageResponse.ok) {
            throw new Error(`Request failed: ${response.status} / ${packageResponse.status}`);
          }
          return packageResponse.json();
        });
    })
    .then(data => normalizeJourneyData(data));
}

function normalizeJourneyData(data) {
  if (!data || typeof data !== 'object') {
    return samplePackage;
  }

  if (data.manifest || data.files) {
    return data;
  }

  const events = Array.isArray(data.events) ? data.events : [];
  const fallbackRoute = samplePackage.manifest.route;
  const stories = events.map((event, index) => {
    const content = event.content || {};
    const narration = content.narration || {};
    return {
      id: content.id || `route-story-${index}`,
      title: content.title || `Story ${index + 1}`,
      category: content.category || 'history',
      tags: Array.isArray(content.tags) ? content.tags : [content.category || 'history'],
      narration: {
        headline: narration.headline || content.title || `Story ${index + 1}`,
        cue: narration.cue || content.narration_hint || 'Route story',
        summary: narration.summary || content.long_description || content.short_description || content.title || 'Route story',
      },
      // Real GPS position of this story's trigger, from the simulator's own
      // road-route calculation (Phase 6 driving prototype). Sample/demo data
      // has none of these, so GPS driving is only available for journeys
      // loaded from the live simulator.
      triggerPoint: event.triggerPoint && typeof event.triggerPoint.lng === 'number' && typeof event.triggerPoint.lat === 'number'
        ? { lng: event.triggerPoint.lng, lat: event.triggerPoint.lat }
        : null,
      approxKm: typeof event.approxKm === 'number' ? event.approxKm : null,
    };
  });

  return {
    journeyId: data.journeyId || 'live-journey',
    coverage: data.coverage || null,
    language: 'en',
    manifest: {
      journeyId: data.journeyId || 'live-journey',
      generatedAt: new Date().toISOString(),
      language: 'en',
      route: fallbackRoute,
      storyCount: stories.length,
      stories,
      assets: [],
    },
    files: [],
  };
}

function haversineDistanceKm(a, b) {
  const toRad = value => (value * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const hav = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * R * Math.asin(Math.sqrt(hav));
}

function getRouteDistanceKm(packageData) {
  const manifest = packageData.manifest ?? packageData;
  const route = manifest.route ?? { coordinates: [] };
  const coords = route.coordinates ?? [];
  if (coords.length < 2) return 0;

  let total = 0;
  for (let i = 1; i < coords.length; i += 1) {
    total += haversineDistanceKm(coords[i - 1], coords[i]);
  }

  return total;
}

function getStoryDistanceThresholds(packageData) {
  const manifest = packageData.manifest ?? packageData;
  const stories = manifest.stories ?? [];
  const routeDistance = getRouteDistanceKm(packageData);

  if (!stories.length) {
    return [];
  }

  if (routeDistance <= 0) {
    return stories.map((_, index) => ({
      index,
      startKm: 0,
      endKm: 0,
      percent: stories.length ? Math.round(((index + 1) / stories.length) * 100) : 0,
    }));
  }

  const thresholds = [];
  for (let index = 0; index < stories.length; index += 1) {
    const startRatio = index / stories.length;
    const endRatio = (index + 1) / stories.length;
    const startKm = routeDistance * startRatio;
    const endKm = routeDistance * endRatio;
    thresholds.push({
      index,
      startKm,
      endKm,
      percent: Math.round(endRatio * 100),
    });
  }

  return thresholds;
}

function renderSummary(packageData) {
  const summary = document.getElementById('summary');
  const manifest = packageData.manifest ?? packageData;
  const route = manifest.route ?? { type: 'LineString', coordinates: [] };
  const totalDistance = getRouteDistanceKm(packageData);
  const coverage = packageData.coverage ?? {};

  summary.innerHTML = `
    <div class="kpis">
      <div class="kpi"><span>Journey</span><strong>${packageData.journeyId ?? manifest.journeyId}</strong></div>
      <div class="kpi"><span>Stories</span><strong>${manifest.storyCount ?? manifest.stories?.length ?? 0}</strong></div>
      <div class="kpi"><span>Route points</span><strong>${route.coordinates?.length ?? 0}</strong></div>
      <div class="kpi"><span>Distance</span><strong>${totalDistance ? `${totalDistance.toFixed(1)} km` : (coverage.routeLengthKm ? `${coverage.routeLengthKm.toFixed(1)} km` : '0.0 km')}</strong></div>
      <div class="kpi"><span>Language</span><strong>${manifest.language ?? 'en'}</strong></div>
    </div>
    <div class="kpis compact">
      <div class="kpi lite"><span>Longest gap</span><strong>${coverage.longestGapKm ? `${coverage.longestGapKm.toFixed(1)} km` : '—'}</strong></div>
      <div class="kpi lite"><span>Avg gap</span><strong>${coverage.avgGapKm ? `${coverage.avgGapKm.toFixed(1)} km` : '—'}</strong></div>
      <div class="kpi lite"><span>Uncovered</span><strong>${coverage.uncoveredStretches?.length ?? 0}</strong></div>
    </div>
  `;
}

function renderStoryList(packageData) {
  const listEl = document.getElementById('storyList');
  const manifest = packageData.manifest ?? packageData;
  const stories = manifest.stories ?? [];

  if (!stories.length) {
    listEl.innerHTML = '<div class="empty-state">No stories available for this route.</div>';
    return;
  }

  const segments = getStoryDistanceThresholds(packageData);

  listEl.innerHTML = stories
    .map((story, index) => {
      const segment = segments[index] ?? { startKm: 0, endKm: 0 };
      const rangeText = `Route ${segment.startKm.toFixed(1)}–${segment.endKm.toFixed(1)} km`;
      return `
        <button class="story-card ${index === state.selectedIndex ? 'active' : ''}" data-index="${index}" type="button">
          <span class="tag">${story.category}</span>
          <h3>${story.title}</h3>
          <div class="muted">${rangeText}</div>
          <div class="muted">${story.tags?.join(', ') || 'general'}</div>
        </button>
      `;
    })
    .join('');

  listEl.querySelectorAll('.story-card').forEach(button => {
    button.addEventListener('click', () => {
      const nextIndex = Number(button.dataset.index);
      const thresholds = getStoryDistanceThresholds(packageData);
      const target = thresholds[nextIndex] ?? { percent: 0 };
      state.selectedIndex = nextIndex;
      state.progress = Number(target.percent ?? 0);
      updateProgressControls();
      renderStoryDetail(packageData);
      renderStoryList(packageData);
    });
  });
}

function getActiveStoryIndex(packageData) {
  const manifest = packageData.manifest ?? packageData;
  const stories = manifest.stories ?? [];
  if (!stories.length) return 0;

  if (state.drivingMode === 'gps' && state.gpsTriggeredIndex !== null) {
    return state.gpsTriggeredIndex;
  }

  const thresholds = getStoryDistanceThresholds(packageData);
  const currentProgress = Math.max(0, Math.min(100, state.progress));

  for (let i = thresholds.length - 1; i >= 0; i -= 1) {
    if (currentProgress >= (thresholds[i]?.percent ?? 0)) {
      return i;
    }
  }

  return 0;
}

function getJourneyState(packageData) {
  const manifest = packageData.manifest ?? packageData;
  const stories = manifest.stories ?? [];
  const currentIndex = getActiveStoryIndex(packageData);
  const currentStory = stories[currentIndex] ?? null;
  const nextStory = stories[currentIndex + 1] ?? null;
  const completion = Math.min(100, Math.max(0, state.progress));

  return {
    currentStop: currentStory?.title ?? 'Route start',
    nextStop: nextStory?.title ?? (completion >= 100 ? 'Journey complete' : 'Destination reached'),
    completion,
    isCompleted: completion >= 100,
  };
}

function renderStoryDetail(packageData) {
  const detailEl = document.getElementById('storyDetail');
  const manifest = packageData.manifest ?? packageData;
  const stories = manifest.stories ?? [];
  const segments = getStoryDistanceThresholds(packageData);
  const previousIndex = state.selectedIndex;
  state.selectedIndex = getActiveStoryIndex(packageData);
  if (state.selectedIndex !== previousIndex) {
    stopSpeaking();
  }
  const story = stories[state.selectedIndex];
  const routeDistance = getRouteDistanceKm(packageData);
  const reachedDistance = routeDistance ? (routeDistance * (state.progress / 100)).toFixed(1) : '0.0';
  const segment = segments[state.selectedIndex] ?? { startKm: 0, endKm: 0 };
  const journeyState = getJourneyState(packageData);

  if (!story) {
    detailEl.innerHTML = '<div class="empty-state">Select a story to view details.</div>';
    return;
  }

  const prototypeNarration = narrationPrototype[story.title];
  const bodyText = prototypeNarration
    ? prototypeNarration[state.narrationLanguage]?.script ?? prototypeNarration.en.script
    : story.narration?.summary || story.title;
  const noTranslationNote =
    !prototypeNarration && state.narrationLanguage === 'hi'
      ? '<p class="story-body muted">(No Hindi narration prototype for this story yet — showing the English summary. Only 10 sample stories have curated Phase 4 scripts.)</p>'
      : '';

  detailEl.innerHTML = `
    <div class="journey-state">
      <div class="journey-state-row"><span>Current stop</span><strong>${journeyState.currentStop}</strong></div>
      <div class="journey-state-row"><span>Next stop</span><strong>${journeyState.nextStop}</strong></div>
      <div class="journey-state-row"><span>Route completion</span><strong>${journeyState.completion}%</strong></div>
    </div>
    <div class="tag">${story.category}</div>
    <h3>${story.title}</h3>
    ${prototypeNarration ? '<div class="tag">Phase 4 narration prototype</div>' : ''}
    <p class="story-body">${bodyText}</p>
    ${noTranslationNote}
    <p class="story-body"><strong>Cue:</strong> ${story.narration?.cue || 'Short route note.'}</p>
    <p class="story-body"><strong>Route segment:</strong> ${segment.startKm.toFixed(1)}–${segment.endKm.toFixed(1)} km</p>
    <p class="story-body"><strong>Travelled:</strong> ${reachedDistance} km along route</p>
    <p class="story-body"><strong>Tags:</strong> ${story.tags?.join(', ') || 'general'}</p>
  `;

  updateNarrationControls(story);
}

function getCurrentNarrationText(story) {
  const prototypeNarration = story ? narrationPrototype[story.title] : null;
  if (prototypeNarration) {
    return prototypeNarration[state.narrationLanguage]?.script ?? prototypeNarration.en.script;
  }
  return story?.narration?.summary || story?.title || '';
}

function updateNarrationControls(story) {
  const speakButton = document.getElementById('speakButton');
  const metaEl = document.getElementById('narrationMeta');
  const prototypeNarration = story ? narrationPrototype[story.title] : null;
  const hasSpeechSupport = typeof window !== 'undefined' && 'speechSynthesis' in window;

  if (speakButton) {
    speakButton.disabled = !hasSpeechSupport;
  }

  if (metaEl) {
    if (!hasSpeechSupport) {
      metaEl.textContent = 'Speech synthesis is not supported in this browser.';
    } else if (prototypeNarration) {
      const langData = prototypeNarration[state.narrationLanguage] ?? prototypeNarration.en;
      metaEl.textContent = `Curated Phase 4 script — estimated ${langData.estimatedSeconds}s spoken (${state.narrationLanguage.toUpperCase()}).`;
    } else {
      metaEl.textContent = 'No curated Phase 4 script for this story yet — speaking the fallback summary text.';
    }
  }
}

function speakCurrentStory() {
  if (!('speechSynthesis' in window)) return;
  const packageData = window.currentPackageData || samplePackage;
  const manifest = packageData.manifest ?? packageData;
  const stories = manifest.stories ?? [];
  const story = stories[state.selectedIndex];
  const text = getCurrentNarrationText(story);
  if (!text) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = state.narrationLanguage === 'hi' ? 'hi-IN' : 'en-IN';
  window.speechSynthesis.speak(utterance);
}

function stopSpeaking() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

// --- Phase 6: real-world driving prototype (GPS-based story triggering) ---
//
// Flow: Start Journey -> Choose language -> Load journey -> Drive ->
// GPS/route position -> Story trigger -> Play narration.
//
// This reuses the simulator's own real trigger points (event.triggerPoint,
// carried through by normalizeJourneyData) instead of any new location
// logic, and reuses the existing Phase 4 speakCurrentStory() for narration.

const GPS_TRIGGER_RADIUS_METERS = 300;

function haversineMeters(a, b) {
  return haversineDistanceKm(a, b) * 1000;
}

function getStoryTriggerPoints(packageData) {
  const manifest = packageData.manifest ?? packageData;
  const stories = manifest.stories ?? [];
  return stories.map(story => (story.triggerPoint ? [story.triggerPoint.lng, story.triggerPoint.lat] : null));
}

function setDrivingStatus(message, isError = false) {
  const el = document.getElementById('drivingStatus');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', isError);
}

function updateDrivingControls() {
  const startButton = document.getElementById('startDrivingButton');
  const stopButton = document.getElementById('stopDrivingButton');
  const isDriving = state.gpsWatchId !== null;
  if (startButton) startButton.disabled = isDriving;
  if (stopButton) stopButton.disabled = !isDriving;
}

function onGpsPosition(position) {
  const packageData = window.currentPackageData || samplePackage;
  const manifest = packageData.manifest ?? packageData;
  const stories = manifest.stories ?? [];
  const triggerPoints = getStoryTriggerPoints(packageData);
  const accuracyText = Number.isFinite(position.coords.accuracy) ? `\u00b1${Math.round(position.coords.accuracy)}m` : 'unknown accuracy';

  if (!triggerPoints.some(Boolean)) {
    setDrivingStatus('This journey has no real trigger points (demo/sample data) \u2014 load a journey ID from the live simulator to use GPS driving.', true);
    return;
  }

  const current = [position.coords.longitude, position.coords.latitude];
  let nearestIndex = -1;
  let nearestDistance = Infinity;

  triggerPoints.forEach((point, index) => {
    if (!point) return;
    if (state.gpsTriggeredStoryIds.has(stories[index]?.id)) return;
    const distance = haversineMeters(current, point);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  if (nearestIndex === -1) {
    setDrivingStatus(`GPS fix received (${accuracyText}). All stories on this route have already been triggered.`);
    return;
  }

  if (nearestDistance <= GPS_TRIGGER_RADIUS_METERS) {
    const story = stories[nearestIndex];
    state.gpsTriggeredStoryIds.add(story.id);
    state.gpsTriggeredIndex = nearestIndex;
    renderStoryDetail(packageData);
    renderStoryList(packageData);
    setDrivingStatus(`Triggered "${story.title}" (${Math.round(nearestDistance)}m from trigger point, ${accuracyText}). Speaking narration...`);
    speakCurrentStory();
  } else {
    setDrivingStatus(`GPS fix received (${accuracyText}). Next story "${stories[nearestIndex]?.title}" in ~${Math.round(nearestDistance)}m.`);
  }
}

function onGpsError(error) {
  setDrivingStatus(`GPS error: ${error.message || 'unable to get location'}`, true);
  stopDriving();
}

function startDriving() {
  if (!('geolocation' in navigator)) {
    setDrivingStatus('Geolocation is not supported in this browser.', true);
    return;
  }

  const packageData = window.currentPackageData || samplePackage;
  const triggerPoints = getStoryTriggerPoints(packageData);
  if (!triggerPoints.some(Boolean)) {
    setDrivingStatus('This journey has no real trigger points (demo/sample data) \u2014 load a journey ID from the live simulator first.', true);
    return;
  }

  stopPlayback();
  state.drivingMode = 'gps';
  state.gpsTriggeredIndex = null;
  state.gpsTriggeredStoryIds = new Set();
  setDrivingStatus('Waiting for GPS fix...');

  state.gpsWatchId = navigator.geolocation.watchPosition(onGpsPosition, onGpsError, {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 20000,
  });

  updateDrivingControls();
}

function stopDriving() {
  if (state.gpsWatchId !== null && 'geolocation' in navigator) {
    navigator.geolocation.clearWatch(state.gpsWatchId);
  }
  state.gpsWatchId = null;
  state.drivingMode = 'simulated';
  setDrivingStatus('Driving stopped.');
  updateDrivingControls();
}

function updatePlaybackState() {
  const playbackStateEl = document.getElementById('playbackState');
  const playButton = document.getElementById('playRouteButton');
  if (playbackStateEl) {
    playbackStateEl.textContent = state.playbackStatus.charAt(0).toUpperCase() + state.playbackStatus.slice(1);
    playbackStateEl.classList.remove('playing', 'paused', 'completed');
    playbackStateEl.classList.add(state.playbackStatus);
  }

  if (playButton) {
    if (state.playbackStatus === 'playing') {
      playButton.textContent = 'Pause route';
    } else if (state.playbackStatus === 'completed') {
      playButton.textContent = 'Replay route';
    } else {
      playButton.textContent = 'Play route';
    }
  }
}

function updateProgressControls() {
  const slider = document.getElementById('progressSlider');
  const progressValue = document.getElementById('progressValue');
  const completionBar = document.getElementById('completionBar');
  if (slider) slider.value = String(state.progress);
  if (progressValue) progressValue.textContent = `${state.progress}%`;
  if (completionBar) completionBar.style.width = `${state.progress}%`;
  if (state.progress >= 100) {
    state.playbackStatus = 'completed';
  } else if (state.playbackStatus === 'completed') {
    state.playbackStatus = 'paused';
  }
  updatePlaybackState();
}

function renderPackage(packageData) {
  renderSummary(packageData);
  renderStoryList(packageData);
  renderStoryDetail(packageData);
  updateProgressControls();
}

function setLoadingState(isLoading) {
  state.isLoading = isLoading;

  const loadButton = document.getElementById('loadPackageButton');
  const playButton = document.getElementById('playRouteButton');

  if (loadButton) {
    loadButton.disabled = isLoading;
  }

  if (playButton) {
    playButton.disabled = isLoading;
  }
}

function setStatus(message, isError = false) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.classList.remove('muted', 'error', 'success', 'loading');

  if (isError) {
    statusEl.classList.add('error');
  } else if (message.toLowerCase().includes('loading')) {
    statusEl.classList.add('loading');
  } else if (message.toLowerCase().includes('loaded') || message.toLowerCase().includes('ready')) {
    statusEl.classList.add('success');
  } else {
    statusEl.classList.add('muted');
  }
}

function handleProgressChange(packageData) {
  const slider = document.getElementById('progressSlider');
  if (!slider) return;

  state.progress = Number(slider.value);
  updateProgressControls();
  renderStoryDetail(packageData);
  renderStoryList(packageData);
}

function stopPlayback() {
  if (state.playbackTimer) {
    clearInterval(state.playbackTimer);
    state.playbackTimer = null;
  }
}

function startPlayback() {
  stopPlayback();
  if (state.gpsWatchId !== null) {
    stopDriving();
  }
  state.playbackStatus = 'playing';
  updatePlaybackState();

  state.playbackTimer = setInterval(() => {
    const packageData = window.currentPackageData || samplePackage;
    if (state.progress >= 100) {
      stopPlayback();
      state.playbackStatus = 'completed';
      updatePlaybackState();
      return;
    }

    state.progress = Math.min(100, state.progress + 5);
    updateProgressControls();
    renderStoryDetail(packageData);
    renderStoryList(packageData);
  }, 700);
}

function togglePlayback() {
  const packageData = window.currentPackageData || samplePackage;

  if (state.playbackStatus === 'playing') {
    stopPlayback();
    state.playbackStatus = 'paused';
    updatePlaybackState();
    return;
  }

  if (state.progress >= 100) {
    state.progress = 0;
    updateProgressControls();
  }

  startPlayback();
  renderStoryDetail(packageData);
  renderStoryList(packageData);
}

document.getElementById('loadPackageButton').addEventListener('click', loadPackage);
document.getElementById('playRouteButton').addEventListener('click', () => {
  togglePlayback();
});

const speakButton = document.getElementById('speakButton');
if (speakButton) {
  speakButton.addEventListener('click', speakCurrentStory);
}

const stopSpeakButton = document.getElementById('stopSpeakButton');
if (stopSpeakButton) {
  stopSpeakButton.addEventListener('click', stopSpeaking);
}

const narrationLanguageSelect = document.getElementById('narrationLanguage');
if (narrationLanguageSelect) {
  narrationLanguageSelect.value = state.narrationLanguage;
  narrationLanguageSelect.addEventListener('change', () => {
    state.narrationLanguage = narrationLanguageSelect.value;
    stopSpeaking();
    const packageData = window.currentPackageData || samplePackage;
    renderStoryDetail(packageData);
  });
}

const startDrivingButton = document.getElementById('startDrivingButton');
if (startDrivingButton) {
  startDrivingButton.addEventListener('click', startDriving);
}

const stopDrivingButton = document.getElementById('stopDrivingButton');
if (stopDrivingButton) {
  stopDrivingButton.addEventListener('click', stopDriving);
}

updateDrivingControls();

const defaultJourneyId = document.getElementById('journeyIdInput').value.trim();
const slider = document.getElementById('progressSlider');
if (slider) {
  slider.addEventListener('input', () => {
    const packageData = window.currentPackageData || samplePackage;
    handleProgressChange(packageData);
  });
}

window.currentPackageData = samplePackage;
state.playbackStatus = 'paused';
updatePlaybackState();

if (defaultJourneyId) {
  loadPackage();
} else {
  renderPackage(samplePackage);
  setStatus('Ready to load a journey package.');
}

function loadPackage() {
  stopPlayback();
  if (state.gpsWatchId !== null) {
    stopDriving();
  }
  setLoadingState(true);
  setStatus('Loading package...');

  readPackage()
    .then((packageData) => {
      window.currentPackageData = packageData;
      state.selectedIndex = 0;
      state.progress = 0;
      state.playbackStatus = 'paused';
      updatePlaybackState();
      renderPackage(packageData);
      setStatus(`Loaded journey package: ${packageData.journeyId ?? packageData.manifest?.journeyId}`);
    })
    .catch((error) => {
      console.error(error);
      window.currentPackageData = samplePackage;
      state.selectedIndex = 0;
      state.progress = 0;
      state.playbackStatus = 'paused';
      updatePlaybackState();
      setStatus(`Unable to load package. ${error.message}`, true);
      renderPackage(samplePackage);
    })
    .finally(() => {
      setLoadingState(false);
    });
}
