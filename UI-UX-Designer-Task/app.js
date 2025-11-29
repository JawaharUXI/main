/**
 * RF Link Planner - Main Application
 * Vanilla JavaScript implementation
 */

// =========================================
// Application State
// =========================================
const state = {
  towers: [],
  links: [],
  selectedTowerId: null,
  selectedLinkId: null,
  linkMode: { active: false, firstTowerId: null },
  showFresnelZone: true,
  editingTowerId: null
};

// Leaflet map and layer references
let map = null;
let towerMarkers = {};
let linkPolylines = {};
let fresnelPolygon = null;

// Bootstrap modal instances
let towerModal = null;
let confirmModal = null;
let confirmCallback = null;

// =========================================
// Initialization
// =========================================
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initModals();
  initFresnelButton();
  updateUI();
});

function initFresnelButton() {
  // Set initial Fresnel button state (active by default)
  const btn = document.getElementById('fresnelBtn');
  if (state.showFresnelZone) {
    btn.style.background = 'rgba(65, 181, 153, 0.2)';
    btn.style.borderColor = 'var(--primary-color)';
  }
}

function initMap() {
  // Initialize Leaflet map
  map = L.map('map').setView([20.5937, 78.9629], 5); // India center

  // Add OpenStreetMap tile layer
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  // Map click handler for adding towers
  map.on('click', (e) => {
    if (!state.linkMode.active) {
      addTower(e.latlng.lat, e.latlng.lng);
    }
  });
}

function initModals() {
  towerModal = new bootstrap.Modal(document.getElementById('towerModal'));
  confirmModal = new bootstrap.Modal(document.getElementById('confirmModal'));
  
  // Set up confirm button handler
  document.getElementById('confirmBtn').addEventListener('click', () => {
    if (confirmCallback) {
      confirmCallback();
      confirmCallback = null;
    }
    confirmModal.hide();
  });
}

// =========================================
// Tower Management
// =========================================
function addTower(lat, lng) {
  const newTower = {
    id: generateId(),
    lat: lat,
    lng: lng,
    frequency: 5.8,
    name: `Tower ${state.towers.length + 1}`
  };
  
  state.towers.push(newTower);
  addTowerMarker(newTower);
  updateUI();
  showToast(`${newTower.name} placed successfully`, 'success');
}

function updateTower(towerId, updates) {
  const tower = state.towers.find(t => t.id === towerId);
  if (tower) {
    Object.assign(tower, updates);
    updateTowerMarker(tower);
    updateUI();
    showToast('Tower updated successfully', 'success');
  }
}

function deleteTower(towerId) {
  const tower = state.towers.find(t => t.id === towerId);
  
  // Remove associated links
  state.links = state.links.filter(l => {
    if (l.tower1Id === towerId || l.tower2Id === towerId) {
      removeLinkPolyline(l.id);
      return false;
    }
    return true;
  });
  
  // Remove tower
  state.towers = state.towers.filter(t => t.id !== towerId);
  removeTowerMarker(towerId);
  
  if (state.selectedTowerId === towerId) {
    state.selectedTowerId = null;
  }
  
  updateUI();
  showToast(`${tower?.name || 'Tower'} deleted`, 'success');
}

// =========================================
// Link Management
// =========================================
function handleTowerClickForLink(towerId) {
  if (!state.linkMode.active) return;

  if (!state.linkMode.firstTowerId) {
    // First tower selected
    state.linkMode.firstTowerId = towerId;
    state.selectedTowerId = towerId;
    updateTowerMarkers();
    updateLinkModeIndicator();
    showToast('First tower selected. Click another tower to create link.', 'info');
  } else if (state.linkMode.firstTowerId === towerId) {
    // Same tower clicked, cancel
    state.linkMode = { active: false, firstTowerId: null };
    state.selectedTowerId = null;
    updateTowerMarkers();
    updateLinkModeIndicator();
    showToast('Link creation cancelled', 'warning');
  } else {
    // Second tower selected - create link
    const tower1 = state.towers.find(t => t.id === state.linkMode.firstTowerId);
    const tower2 = state.towers.find(t => t.id === towerId);

    if (tower1.frequency !== tower2.frequency) {
      showToast(`Cannot create link: Frequencies don't match (${tower1.frequency} GHz vs ${tower2.frequency} GHz)`, 'danger');
      state.linkMode = { active: false, firstTowerId: null };
      state.selectedTowerId = null;
      updateTowerMarkers();
      updateLinkModeIndicator();
      return;
    }

    // Check if link already exists
    const linkExists = state.links.some(l => 
      (l.tower1Id === state.linkMode.firstTowerId && l.tower2Id === towerId) ||
      (l.tower1Id === towerId && l.tower2Id === state.linkMode.firstTowerId)
    );

    if (linkExists) {
      showToast('Link already exists between these towers', 'warning');
      state.linkMode = { active: false, firstTowerId: null };
      state.selectedTowerId = null;
      updateTowerMarkers();
      updateLinkModeIndicator();
      return;
    }

    const newLink = {
      id: generateId(),
      tower1Id: state.linkMode.firstTowerId,
      tower2Id: towerId,
      frequency: tower1.frequency
    };
    
    state.links.push(newLink);
    addLinkPolyline(newLink);
    state.linkMode = { active: false, firstTowerId: null };
    state.selectedTowerId = null;
    updateTowerMarkers();
    updateUI();
    showToast('Link created successfully', 'success');
  }
}

function deleteLink(linkId) {
  state.links = state.links.filter(l => l.id !== linkId);
  removeLinkPolyline(linkId);
  
  if (state.selectedLinkId === linkId) {
    state.selectedLinkId = null;
    removeFresnelZone();
  }
  
  updateUI();
  showToast('Link deleted', 'success');
}

// =========================================
// Map Marker Management
// =========================================
function createTowerIcon(isSelected, isLinkModeFirst) {
  const gradient = isLinkModeFirst
    ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
    : isSelected
      ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
      : 'linear-gradient(135deg, #41B599 0%, #2D8A74 100%)';

  const glowColor = isLinkModeFirst
    ? 'rgba(245, 158, 11, 0.5)'
    : isSelected
      ? 'rgba(16, 185, 129, 0.5)'
      : 'rgba(65, 181, 153, 0.5)';

  const pingHtml = isLinkModeFirst ? `
    <div style="
      position: absolute;
      top: -4px;
      left: -4px;
      right: -4px;
      bottom: -4px;
      border: 2px solid rgba(245, 158, 11, 0.6);
      border-radius: 50%;
      animation: pingAnimation 1.5s ease-in-out infinite;
    "></div>
  ` : '';

  return L.divIcon({
    className: 'tower-marker',
    html: `
      <div style="
        width: 36px;
        height: 36px;
        background: ${gradient};
        border: 3px solid rgba(255, 255, 255, 0.9);
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 4px 15px ${glowColor}, 0 2px 5px rgba(0,0,0,0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.3s ease;
      ">
        <svg style="transform: rotate(45deg); width: 18px; height: 18px;" viewBox="0 0 24 24" fill="white">
          <path d="M12 2L8 6H4v14h16V6h-4L12 2zm0 2.83L14.17 7H16v11H8V7h1.83L12 4.83zM10 9v8h4V9h-4z"/>
        </svg>
      </div>
      ${pingHtml}
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
  });
}

function addTowerMarker(tower) {
  const marker = L.marker([tower.lat, tower.lng], {
    icon: createTowerIcon(false, false)
  });
  
  marker.bindTooltip(`
    <div>
      <strong>${tower.name}</strong><br>
      Frequency: ${tower.frequency} GHz<br>
      <small>${tower.lat.toFixed(5)}, ${tower.lng.toFixed(5)}</small>
    </div>
  `);
  
  marker.on('click', (e) => {
    L.DomEvent.stopPropagation(e);
    handleTowerClick(tower.id);
  });
  
  marker.addTo(map);
  towerMarkers[tower.id] = marker;
}

function updateTowerMarker(tower) {
  const marker = towerMarkers[tower.id];
  if (marker) {
    marker.setIcon(createTowerIcon(
      state.selectedTowerId === tower.id,
      state.linkMode.firstTowerId === tower.id
    ));
    marker.setTooltipContent(`
      <div>
        <strong>${tower.name}</strong><br>
        Frequency: ${tower.frequency} GHz<br>
        <small>${tower.lat.toFixed(5)}, ${tower.lng.toFixed(5)}</small>
      </div>
    `);
  }
}

function updateTowerMarkers() {
  state.towers.forEach(tower => {
    const marker = towerMarkers[tower.id];
    if (marker) {
      marker.setIcon(createTowerIcon(
        state.selectedTowerId === tower.id,
        state.linkMode.firstTowerId === tower.id
      ));
    }
  });
}

function removeTowerMarker(towerId) {
  const marker = towerMarkers[towerId];
  if (marker) {
    map.removeLayer(marker);
    delete towerMarkers[towerId];
  }
}

// =========================================
// Link Polyline Management
// =========================================
function addLinkPolyline(link) {
  const tower1 = state.towers.find(t => t.id === link.tower1Id);
  const tower2 = state.towers.find(t => t.id === link.tower2Id);

  if (!tower1 || !tower2) return;

  const isSelected = state.selectedLinkId === link.id;
  const distance = haversineDistance(tower1.lat, tower1.lng, tower2.lat, tower2.lng);
  const distanceKm = (distance / 1000).toFixed(2);

  // Create the visual polyline
  const polyline = L.polyline(
    [[tower1.lat, tower1.lng], [tower2.lat, tower2.lng]],
    {
      color: isSelected ? '#10b981' : '#41B599',
      weight: isSelected ? 6 : 4,
      opacity: isSelected ? 1 : 0.8,
      dashArray: isSelected ? null : '8, 12',
      lineCap: 'round',
      lineJoin: 'round',
      interactive: true,
      bubblingMouseEvents: false
    }
  );

  polyline.bindTooltip(`
    <div>
      <strong><i class="bi bi-link-45deg"></i> RF Link</strong><br>
      ${tower1.name} ↔ ${tower2.name}<br>
      <i class="bi bi-rulers"></i> Distance: ${distanceKm} km<br>
      <i class="bi bi-broadcast"></i> Frequency: ${link.frequency} GHz<br>
      <small style="color: #888;">Click to show Fresnel zone</small>
    </div>
  `, { sticky: true });

  polyline.on('click', (e) => {
    L.DomEvent.stopPropagation(e);
    console.log('Polyline click event fired for link:', link.id);
    handleLinkClick(link.id);
  });

  polyline.addTo(map);
  linkPolylines[link.id] = polyline;
}

function updateLinkPolyline(link) {
  removeLinkPolyline(link.id);
  addLinkPolyline(link);
}

function removeLinkPolyline(linkId) {
  const polyline = linkPolylines[linkId];
  if (polyline) {
    map.removeLayer(polyline);
    delete linkPolylines[linkId];
  }
}

function updateLinkPolylines() {
  state.links.forEach(link => {
    updateLinkPolyline(link);
  });
}

// =========================================
// Fresnel Zone Visualization
// =========================================
function showFresnelZone(link) {
  removeFresnelZone();

  if (!state.showFresnelZone) {
    console.log('Fresnel zone display is disabled');
    return;
  }

  const tower1 = state.towers.find(t => t.id === link.tower1Id);
  const tower2 = state.towers.find(t => t.id === link.tower2Id);

  if (!tower1 || !tower2) {
    console.log('Could not find towers for Fresnel zone:', link.tower1Id, link.tower2Id);
    return;
  }

  try {
    const distance = haversineDistance(tower1.lat, tower1.lng, tower2.lat, tower2.lng);
    const maxRadius = computeFresnelMaxRadius(distance, link.frequency);

    // Calculate a scale factor to make the Fresnel zone visible
    // For very long links, the actual Fresnel zone is too thin to see
    // We scale it up for visualization purposes while keeping the shape accurate
    // Target: make the max width roughly 2-5% of the link distance for visibility
    const targetVisibleWidth = distance * 0.02; // 2% of link distance
    const scaleFactor = maxRadius > 0 ? Math.max(1, targetVisibleWidth / maxRadius) : 1;

    console.log('Fresnel zone calculation:', {
      frequency: link.frequency + ' GHz',
      distance: (distance / 1000).toFixed(2) + ' km',
      actualMaxRadius: maxRadius.toFixed(2) + ' m',
      scaleFactor: scaleFactor.toFixed(2),
      displayedMaxRadius: (maxRadius * scaleFactor).toFixed(2) + ' m'
    });

    const polygonPoints = generateFresnelPolygon(tower1, tower2, link.frequency, scaleFactor);

    if (!polygonPoints || polygonPoints.length === 0) {
      console.error('No polygon points generated for Fresnel zone');
      return;
    }

    console.log('Polygon points sample:', polygonPoints.slice(0, 3));

    fresnelPolygon = L.polygon(polygonPoints, {
      color: '#ff6b6b',
      fillColor: '#ff8a8a',
      fillOpacity: 0.3,
      weight: 2,
      opacity: 0.9,
      className: 'fresnel-zone-polygon'
    });

    const scaleNote = scaleFactor > 1 ? `<br><small style="color:#ffa500;"><i class="bi bi-exclamation-triangle"></i> Scaled ${scaleFactor.toFixed(0)}x for visibility</small>` : '';

    fresnelPolygon.bindTooltip(`
      <div>
        <strong><i class="bi bi-circle" style="color:#ff6b6b;"></i> First Fresnel Zone</strong><br>
        Frequency: ${link.frequency} GHz<br>
        Distance: ${(distance / 1000).toFixed(2)} km<br>
        Max Radius: ${maxRadius.toFixed(2)} m${scaleNote}
      </div>
    `, { sticky: true });

    fresnelPolygon.addTo(map);

    // Bring the Fresnel zone to back so the link line is on top
    fresnelPolygon.bringToBack();

    console.log('✅ Fresnel zone added to map successfully');
  } catch (error) {
    console.error('Error creating Fresnel zone:', error);
    console.error(error.stack);
  }
}

function removeFresnelZone() {
  if (fresnelPolygon) {
    map.removeLayer(fresnelPolygon);
    fresnelPolygon = null;
  }
}

// =========================================
// UI Event Handlers
// =========================================
function handleTowerClick(towerId) {
  if (state.linkMode.active) {
    handleTowerClickForLink(towerId);
  } else {
    state.selectedTowerId = state.selectedTowerId === towerId ? null : towerId;
    state.selectedLinkId = null;
    removeFresnelZone();
    updateTowerMarkers();
    updateUI();
  }
}

function handleLinkClick(linkId) {
  console.log('Link clicked:', linkId, 'Link mode active:', state.linkMode.active);

  if (!state.linkMode.active) {
    // Toggle selection
    const wasSelected = state.selectedLinkId === linkId;
    state.selectedLinkId = wasSelected ? null : linkId;
    state.selectedTowerId = null;

    console.log('Link selected:', state.selectedLinkId);

    updateTowerMarkers();
    updateLinkPolylines();

    if (state.selectedLinkId) {
      const link = state.links.find(l => l.id === linkId);
      console.log('Found link for Fresnel:', link);
      if (link) {
        showFresnelZone(link);
      }
    } else {
      removeFresnelZone();
    }

    updateUI();
  }
}

function toggleLinkMode() {
  state.linkMode = {
    active: !state.linkMode.active,
    firstTowerId: null
  };
  state.selectedTowerId = null;
  updateTowerMarkers();
  updateLinkModeIndicator();
  updateUI();

  if (state.linkMode.active) {
    showToast('Link creation mode enabled. Click a tower to start.', 'info');
  }
}

function toggleFresnelZone() {
  state.showFresnelZone = !state.showFresnelZone;

  const btn = document.getElementById('fresnelBtn');
  if (state.showFresnelZone) {
    btn.style.background = 'rgba(65, 181, 153, 0.2)';
    btn.style.borderColor = 'var(--primary-color)';
  } else {
    btn.style.background = 'transparent';
    btn.style.borderColor = 'rgba(255,255,255,0.2)';
  }

  if (state.selectedLinkId && state.showFresnelZone) {
    const link = state.links.find(l => l.id === state.selectedLinkId);
    if (link) {
      showFresnelZone(link);
    }
  } else {
    removeFresnelZone();
  }
}

function confirmClearAll() {
  showConfirm('Clear All', 'Are you sure you want to delete all towers and links? This action cannot be undone.', () => {
    // Clear all towers
    Object.keys(towerMarkers).forEach(id => removeTowerMarker(id));
    // Clear all links
    Object.keys(linkPolylines).forEach(id => removeLinkPolyline(id));
    // Clear Fresnel zone
    removeFresnelZone();

    state.towers = [];
    state.links = [];
    state.selectedTowerId = null;
    state.selectedLinkId = null;
    state.linkMode = { active: false, firstTowerId: null };

    updateUI();
    showToast('All towers and links cleared', 'success');
  });
}

function hideGuide() {
  const guideCard = document.getElementById('guideCard');
  guideCard.style.display = 'none';
}

// =========================================
// Tower Modal Functions
// =========================================
function openEditTower(towerId) {
  const tower = state.towers.find(t => t.id === towerId);
  if (!tower) return;

  state.editingTowerId = towerId;

  document.getElementById('towerName').value = tower.name;
  document.getElementById('towerFrequency').value = tower.frequency;
  document.getElementById('towerLat').value = tower.lat.toFixed(6);
  document.getElementById('towerLng').value = tower.lng.toFixed(6);
  document.getElementById('towerModalError').style.display = 'none';

  updatePresetButtons(tower.frequency);

  towerModal.show();
}

function saveTower() {
  const name = document.getElementById('towerName').value.trim();
  const frequency = parseFloat(document.getElementById('towerFrequency').value);
  const errorEl = document.getElementById('towerModalError');

  if (!name) {
    errorEl.textContent = 'Tower name is required';
    errorEl.style.display = 'block';
    return;
  }

  if (frequency <= 0 || frequency > 100) {
    errorEl.textContent = 'Frequency must be between 0.1 and 100 GHz';
    errorEl.style.display = 'block';
    return;
  }

  updateTower(state.editingTowerId, { name, frequency });
  towerModal.hide();
  state.editingTowerId = null;
}

function setFrequencyPreset(value) {
  document.getElementById('towerFrequency').value = value;
  updatePresetButtons(value);
}

function updatePresetButtons(activeValue) {
  const buttons = document.querySelectorAll('.preset-btn');
  buttons.forEach(btn => {
    const val = parseFloat(btn.textContent);
    btn.classList.toggle('active', val === activeValue);
  });
}

// =========================================
// Confirm Modal Functions
// =========================================
function showConfirm(title, message, callback) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  confirmCallback = callback;
  confirmModal.show();
}

function confirmDeleteTower(towerId) {
  const tower = state.towers.find(t => t.id === towerId);
  showConfirm('Delete Tower', `Are you sure you want to delete "${tower?.name || 'this tower'}"?`, () => {
    deleteTower(towerId);
  });
}

function confirmDeleteLink(linkId) {
  showConfirm('Delete Link', 'Are you sure you want to delete this link?', () => {
    deleteLink(linkId);
  });
}

// =========================================
// Toast Notifications
// =========================================
function showToast(message, variant = 'success') {
  const container = document.getElementById('toastContainer');
  const toastId = 'toast-' + generateId();

  const iconMap = {
    success: '<i class="bi bi-check-lg"></i>',
    danger: '<i class="bi bi-x-lg"></i>',
    warning: '<i class="bi bi-exclamation-triangle"></i>',
    info: '<i class="bi bi-info-circle"></i>'
  };

  const toastHtml = `
    <div class="toast toast-modern ${variant}" id="${toastId}" role="alert">
      <div class="toast-body toast-body-modern">
        <span class="toast-icon ${variant}">${iconMap[variant] || 'ℹ'}</span>
        ${message}
      </div>
    </div>
  `;

  container.insertAdjacentHTML('beforeend', toastHtml);

  const toastEl = document.getElementById(toastId);
  const toast = new bootstrap.Toast(toastEl, { autohide: true, delay: 3000 });
  toast.show();

  toastEl.addEventListener('hidden.bs.toast', () => {
    toastEl.remove();
  });
}

// =========================================
// UI Update Functions
// =========================================
function updateUI() {
  updateTowersList();
  updateLinksList();
  updateControlButtons();
  updateLinkModeIndicator();
}

function updateTowersList() {
  const container = document.getElementById('towersList');
  const countEl = document.getElementById('towerCount');

  countEl.textContent = state.towers.length;

  if (state.towers.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i class="bi bi-geo-alt"></i></div>
        <div class="empty-state-text">Click on the map to place towers</div>
      </div>
    `;
    return;
  }

  container.innerHTML = state.towers.map(tower => `
    <div class="list-item ${state.selectedTowerId === tower.id ? 'selected' : ''}"
         onclick="handleTowerClick('${tower.id}')">
      <div style="display: flex; align-items: center; gap: 12px;">
        <div class="item-icon tower-icon"><i class="bi bi-geo-alt-fill"></i></div>
        <div class="item-content">
          <div class="item-name">${tower.name}</div>
          <div class="item-details">${tower.lat.toFixed(4)}, ${tower.lng.toFixed(4)}</div>
          <span class="badge-modern badge-frequency" style="margin-top: 4px; display: inline-block;">
            ${tower.frequency} GHz
          </span>
        </div>
        <div class="item-actions">
          <button class="action-btn edit" onclick="event.stopPropagation(); openEditTower('${tower.id}')" title="Edit Tower">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="action-btn delete" onclick="event.stopPropagation(); confirmDeleteTower('${tower.id}')" title="Delete Tower">
            <i class="bi bi-trash3"></i>
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

function updateLinksList() {
  const container = document.getElementById('linksList');
  const countEl = document.getElementById('linkCount');

  countEl.textContent = state.links.length;

  if (state.links.length === 0) {
    const message = state.towers.length < 2
      ? 'Place at least 2 towers to create links'
      : 'Enable Link Mode to connect towers';
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i class="bi bi-link"></i></div>
        <div class="empty-state-text">${message}</div>
      </div>
    `;
    return;
  }

  container.innerHTML = state.links.map(link => {
    const tower1 = state.towers.find(t => t.id === link.tower1Id);
    const tower2 = state.towers.find(t => t.id === link.tower2Id);
    const distance = tower1 && tower2
      ? haversineDistance(tower1.lat, tower1.lng, tower2.lat, tower2.lng)
      : 0;

    return `
      <div class="list-item ${state.selectedLinkId === link.id ? 'selected' : ''}"
           onclick="handleLinkClick('${link.id}')">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div class="item-icon link-icon"><i class="bi bi-link-45deg"></i></div>
          <div class="item-content">
            <div class="item-name">${tower1?.name || '?'} ↔ ${tower2?.name || '?'}</div>
            <div class="item-details">Distance: ${(distance / 1000).toFixed(2)} km</div>
            <span class="badge-modern badge-frequency" style="margin-top: 4px; display: inline-block;">
              ${link.frequency} GHz
            </span>
          </div>
          <div class="item-actions">
            <button class="action-btn delete" onclick="event.stopPropagation(); confirmDeleteLink('${link.id}')" title="Delete Link">
              <i class="bi bi-trash3"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function updateControlButtons() {
  const linkBtn = document.getElementById('linkModeBtn');
  const clearBtn = document.getElementById('clearAllBtn');

  // Update link mode button
  if (state.linkMode.active) {
    linkBtn.innerHTML = '<i class="bi bi-link-45deg"></i> Link Mode ON';
    linkBtn.classList.remove('btn-primary-gradient');
    linkBtn.classList.add('btn-success-gradient');
  } else {
    linkBtn.innerHTML = '<i class="bi bi-link-45deg"></i> Create Link';
    linkBtn.classList.remove('btn-success-gradient');
    linkBtn.classList.add('btn-primary-gradient');
  }

  // Disable link button if less than 2 towers
  linkBtn.disabled = state.towers.length < 2;
  linkBtn.style.opacity = state.towers.length < 2 ? '0.5' : '1';
  linkBtn.style.cursor = state.towers.length < 2 ? 'not-allowed' : 'pointer';

  // Disable clear button if no towers/links
  const hasContent = state.towers.length > 0 || state.links.length > 0;
  clearBtn.disabled = !hasContent;
  clearBtn.style.opacity = hasContent ? '1' : '0.5';
}

function updateLinkModeIndicator() {
  const indicator = document.getElementById('linkModeIndicator');

  if (state.linkMode.active) {
    indicator.style.display = 'block';
    indicator.innerHTML = state.linkMode.firstTowerId
      ? '<i class="bi bi-link-45deg"></i> Click second tower to complete link'
      : '<i class="bi bi-link-45deg"></i> Link Mode: Click a tower to start';
  } else {
    indicator.style.display = 'none';
  }
}

// =========================================
// Mobile Responsive Functions
// =========================================

/**
 * Toggle mobile sidebar visibility
 */
function toggleMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const menuIcon = document.getElementById('mobileMenuIcon');

  const isOpen = sidebar.classList.toggle('mobile-open');

  if (isOpen) {
    overlay.classList.add('show');
    menuIcon.classList.remove('bi-list');
    menuIcon.classList.add('bi-x-lg');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
  } else {
    overlay.classList.remove('show');
    menuIcon.classList.remove('bi-x-lg');
    menuIcon.classList.add('bi-list');
    document.body.style.overflow = '';
  }
}

/**
 * Close mobile sidebar
 */
function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const menuIcon = document.getElementById('mobileMenuIcon');

  sidebar.classList.remove('mobile-open');
  overlay.classList.remove('show');

  if (menuIcon) {
    menuIcon.classList.remove('bi-x-lg');
    menuIcon.classList.add('bi-list');
  }

  document.body.style.overflow = '';
}

/**
 * Handle window resize - close mobile sidebar when resizing to desktop
 */
function handleResize() {
  if (window.innerWidth >= 768) {
    closeMobileSidebar();
  }
}

// Add resize listener
window.addEventListener('resize', handleResize);

// Expose mobile functions globally
window.toggleMobileSidebar = toggleMobileSidebar;
window.closeMobileSidebar = closeMobileSidebar;

