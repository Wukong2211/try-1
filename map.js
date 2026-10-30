(() => {
  const CENTER = [12.8248, 80.0494];
  const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
  const MAPLIBRE_URL = 'https://unpkg.com/maplibre-gl@6.15.0/dist/maplibre-gl.mjs';
  let mapLibraryPromise = null;
  const coarse = value => Math.round(value * 1000) / 1000;
  const radians = degrees => degrees * Math.PI / 180;
  function metersBetween(a, b) {
    const dLat = radians(b[0] - a[0]), dLng = radians(b[1] - a[1]);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a[0])) * Math.cos(radians(b[0])) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  function locationFor(item) {
    if (Number.isFinite(+item.pickupLat) && Number.isFinite(+item.pickupLng)) return [+item.pickupLat, +item.pickupLng];
    if (Number.isFinite(+item.x) && Number.isFinite(+item.y)) return [CENTER[0] + (50 - item.y) * .00007, CENTER[1] + (item.x - 50) * .00007];
    return CENTER;
  }
  function loadMapLibrary() {
    if (!mapLibraryPromise) mapLibraryPromise = import(MAPLIBRE_URL).then(lib => { window.maplibregl = lib; return lib; });
    return mapLibraryPromise;
  }
  function status(box, message, retry) {
    let panel = box.querySelector('.map-status');
    if (!panel) { panel = document.createElement('div'); panel.className = 'map-status'; box.append(panel); }
    panel.innerHTML = `<span>${esc(message)}</span><button type="button" class="map-retry">${retry ? 'Reload map' : 'Loading map…'}</button>`;
    panel.querySelector('.map-retry').hidden = !retry;
    if (retry) panel.querySelector('.map-retry').onclick = () => { panel.remove(); box.dispatchEvent(new CustomEvent('borrowed-map-retry')); };
  }
  async function createMap(box) {
    const ml = await loadMapLibrary();
    let map = null;
    const start = () => {
      box.querySelector('.map-status')?.remove();
      if (map) map.remove();
      box.innerHTML = '';
      map = new ml.Map({ container: box, style: MAP_STYLE, center: [CENTER[1], CENTER[0]], zoom: 16, minZoom: 14, maxZoom: 19, attributionControl: true, cooperativeGestures: true });
      map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-left');
      const showFailure = () => {
        if (!map || !map.isStyleLoaded()) status(box, 'The live campus map could not load. Check your connection and retry.', true);
        else if (!map.queryRenderedFeatures().length) status(box, 'Map tiles are unavailable right now. Retry or use the item list below.', true);
      };
      const timer = setTimeout(showFailure, 12000);
      map.on('idle', () => {
        if (map?.queryRenderedFeatures().length) { clearTimeout(timer); box.querySelector('.map-status')?.remove(); }
        else showFailure();
      });
      map.once('load', () => requestAnimationFrame(() => map?.resize()));
      map.on('error', () => { if (!map.isStyleLoaded()) setTimeout(showFailure, 8000); });
      return map;
    };
    return { map: start(), ml };
  }
  function addItemMarker(ml, map, item) {
    const point = locationFor(item);
    const element = document.createElement('button');
    element.type = 'button'; element.className = 'borrowed-map-marker'; element.setAttribute('aria-label', 'Open ' + item.name); element.textContent = item.emoji || '📦';
    const popup = new ml.Popup({ offset: 25 }).setHTML(`<b>${esc(item.name)}</b><br>✦ ${esc(item.credits)} credits / day<br><small>${esc(item.pickupZone || 'Approximate campus pickup')}</small>`);
    new ml.Marker({ element, anchor: 'bottom' }).setLngLat([point[1], point[0]]).setPopup(popup).addTo(map);
    element.addEventListener('click', () => openItem(item.id));
  }

  window.renderMap = function() {
    const shown = state.items.filter(item => !item.mine && item.available !== false);
    app.innerHTML = heading('SRM KTR MAP', 'Find it around campus.', '<button class="text-button" data-go="explore">List view ↗</button>') +
      '<p class="page-sub">Map pins show approximate public pickup points, not students’ live locations.</p><div class="map-heading-actions"><button class="location-button" id="near-me">◎ Use my location</button><span class="map-hint">Borrowed does not store it; the map provider sees the displayed area.</span></div><div id="campus-map" class="campus-map"></div><div class="map-results">' +
      (shown.length ? shown.map(item => `<button class="map-result" data-map-item="${esc(item.id)}"><span>${esc(item.emoji || '📦')}</span><span><b>${esc(item.name)}</b><small>${esc(item.distance || 'Campus pickup')}</small></span><strong>✦ ${item.credits}</strong></button>`).join('') : '<div class="empty-state"><b>No items listed yet</b>List an item to add the first pickup pin.</div>') + '</div>';
    app.querySelector('[data-go="explore"]').addEventListener('click', () => go('explore'));
    app.querySelectorAll('[data-map-item]').forEach(button => button.addEventListener('click', () => openItem(button.dataset.mapItem)));
    const box = document.querySelector('#campus-map');
    box.addEventListener('borrowed-map-retry', () => window.renderMap(), { once: true });
    createMap(box).then(({ map, ml }) => {
      if (!box.isConnected) { map.remove(); return; }
      const nearMeButton = app.querySelector('#near-me');
      if (!nearMeButton) { map.remove(); return; }
      shown.forEach(item => addItemMarker(ml, map, item));
      let youMarker = null;
      nearMeButton.addEventListener('click', () => {
        if (!navigator.geolocation) { showToast('Location is not available in this browser.'); return; }
        showToast('Requesting your location…');
        navigator.geolocation.getCurrentPosition(position => {
          const here = [position.coords.latitude, position.coords.longitude];
          map.flyTo({ center: [here[1], here[0]], zoom: 17 });
          if (youMarker) youMarker.remove();
          const element = document.createElement('div'); element.className = 'borrowed-you-marker';
          youMarker = new ml.Marker({ element }).setLngLat([here[1], here[0]]).setPopup(new ml.Popup({ offset: 18 }).setText('Your live marker is local and is not saved to Borrowed.')).addTo(map);
          shown.forEach(item => { item.distance = Math.round(metersBetween(here, locationFor(item))) + ' m away'; });
          app.querySelectorAll('[data-map-item]').forEach(button => { const item = shown.find(entry => entry.id === button.dataset.mapItem); if (item) button.querySelector('small').textContent = item.distance; });
          showToast('Map centered. Your live location was not saved to Borrowed.');
        }, error => showToast(error.code === 1 ? 'Allow location access to center the map.' : 'Could not get your location; try again outdoors.'), { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
      });
      setTimeout(() => map.resize(), 150);
    }).catch(error => {
      if (!box.isConnected) return;
      console.error('Map failed to load:', error);
      status(box, 'The live campus map could not load. Check your connection and retry.', true);
    });
  };

  let pickerMap = null, pickerMarker = null;
  window.selectedPickup = { lat: coarse(CENTER[0]), lng: coarse(CENTER[1]) };
  window.openListing = function() {
    screen = 'explore';
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('selected', button.dataset.screen === 'list'));
    const dialog = document.querySelector('#list-dialog'); dialog.showModal();
    window.selectedPickup = { lat: coarse(CENTER[0]), lng: coarse(CENTER[1]) };
    document.querySelector('#pickup-help').textContent = 'Campus center selected by default. Tap a public campus meetup spot to move the pin. The saved pin is rounded to about 100 m; never choose a hostel room or home address.';
    dialog.scrollTop = 0;
    setTimeout(() => {
      const box = document.querySelector('#pickup-map-picker');
      if (pickerMap) { pickerMap.remove(); pickerMap = null; pickerMarker = null; }
      box.addEventListener('borrowed-map-retry', () => { dialog.close(); setTimeout(() => window.openListing(), 100); }, { once: true });
      createMap(box).then(({ map, ml }) => {
        pickerMap = map;
        pickerMarker = new ml.Marker({ color: '#397d59' }).setLngLat([window.selectedPickup.lng, window.selectedPickup.lat]).addTo(map);
        pickerMap.on('click', event => {
          const point = [coarse(event.lngLat.lat), coarse(event.lngLat.lng)];
          if (metersBetween(CENTER, point) > 1500) { showToast('Choose a pickup point inside the SRM KTR campus area.'); return; }
          window.selectedPickup = { lat: point[0], lng: point[1] }; pickerMarker.setLngLat([point[1], point[0]]);
          document.querySelector('#pickup-help').textContent = 'Approximate campus pickup selected. Confirm the exact handoff with the other student in a public place.';
        });
        requestAnimationFrame(() => map.resize());
        setTimeout(() => map.resize(), 250);
      }).catch(error => { console.error('Pickup map failed to load:', error); status(box, 'The live pickup map could not load. Your approximate campus-center point is selected.', true); });
    }, 180);
  };
})();
