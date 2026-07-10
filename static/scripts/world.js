// world.js
let worldRecipes = [];
let allWorldJourney = [];
let worldJourney = [];
let selectedJourneyOwner = '';
let worldGeoJSON = null;
let currentRandomCountry = null;
let spinTickTimer = null;
let worldDataLoadingPromise = null;
const WORLD_DATA_CACHE_KEY = 'htmeal_world_data_v1';
const WORLD_DATA_MAX_AGE = 1000 * 60 * 60 * 4; // 4 hours

// Safe way to get headers since getUserHeaders is defined in main.js
function getAuthHeaders(isJson = false) {
    if (typeof getUserHeaders === 'function') {
        return getUserHeaders(isJson);
    }
    // Fallback if getUserHeaders isn't available yet
    const headers = {};
    const user = getCurrentJourneyUser();
    if (user) {
        headers['X-User-Name'] = user;
    }
    if (isJson) {
        headers['Content-Type'] = 'application/json';
    }
    return headers;
}

function getWorldDataCacheKey() {
    const user = getCurrentJourneyUser();
    return `${WORLD_DATA_CACHE_KEY}_${user}`;
}

const countryLocationOverrides = {
    'hawaï': { coords: [-157.8583, 21.3069], name: 'Hawaii' },
    'hawai': { coords: [-157.8583, 21.3069], name: 'Hawaii' },
    'catalonië': { coords: [1.9731, 41.8272], name: 'Catalonia' },
    'wallonië': { coords: [4.7, 50.5], name: 'Wallonia' },
    'amazonegebied': { coords: [-60, -3], name: 'Amazon' }
};

const countryNameAliasMap = {
    'roemenië': 'romania',
    'roemenie': 'romania',
    'ethiopië': 'ethiopia',
    'ethiopie': 'ethiopia',
    'tsjechië': 'czech republic',
    'tsjechie': 'czech republic',
    'oekraïne': 'ukraine',
    'oekraine': 'ukraine',
    'moldavië': 'moldova',
    'moldavie': 'moldova',
    'zuid-korea': 'south korea',
    'zuid korea': 'south korea',
    'noord-korea': 'north korea',
    'noord korea': 'north korea',
    'verenigde staten': 'united states',
    'vietnam': 'vietnam',
    'verenigd koningkrijk': 'united kingdom',
    'verenigd koninkrijk': 'united kingdom',
    'spanje': 'spain',
    'frankrijk': 'france',
    'italië': 'italy',
    'italie': 'italy',
    'griekenland': 'greece',
    'nederland': 'netherlands',
    'duitsland': 'germany',
    'zwitserland': 'switzerland',
    'noorwegen': 'norway',
    'zweden': 'sweden',
    'finland': 'finland',
    'belgië': 'belgium',
    'belgie': 'belgium',
    'bulgarije': 'bulgaria',
    'servië': 'serbia',
    'servie': 'serbia',
    'slovenië': 'slovenia',
    'slovenie': 'slovenia',
    'noord-macedonië': 'north macedonia',
    'noord macedonië': 'north macedonia',
    'noord-macedonie': 'north macedonia',
    'noord macedonie': 'north macedonia',
    'noord macedonië': 'north macedonia',
    'tadzjikistan': 'tajikistan',
    'tadjikistan': 'tajikistan',
    'tadzjikistan': 'tajikistan'
};

function normalizeToken(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function sanitizeCountryName(value) {
    return String(value || '')
        .replace(/^\s*#+\s*/, '')
        .replace(/\s*#\s*$/, '')
        .trim();
}

function normalizeWorldCountryEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const country = sanitizeCountryName(entry.country || entry.Country || '');
    if (!country) return null;
    const normalizedCountry = country.toLowerCase();
    const invalidNames = ['naam', 'continent', 'nationaal_gerecht(en)', 'beschrijving', 'belangrijkste_ingrediënten', 'culinaire_regio'];
    if (invalidNames.some(name => normalizedCountry.startsWith(name))) return null;

    const region = entry.region || entry.Region || entry.Culinaire_regio || '';
    const dishes = entry.nationalDish || entry.Nationaal_gerecht || entry['Nationaal_gerecht(en)'] || entry['nationalDish'] || '';
    const description = entry.description || entry.Beschrijving || '';
    const ingredients = Array.isArray(entry.ingredients)
        ? entry.ingredients
        : (typeof entry.ingredients === 'string'
            ? entry.ingredients.split(/[,;]\s*/).map(i => i.trim()).filter(Boolean)
            : []);

    return {
        id: String(entry.id || entry.ID || '').trim(),
        country,
        continent: entry.continent || entry.Continent || '',
        region: region === 'Culinaire_regio' ? '' : region,
        nationalDish: dishes,
        description,
        ingredients,
        flag: entry.flag || entry.Flag || '',
        status: entry.status || entry.Status || '',
        type: entry.type || entry.Type || '',
        sovereignty: entry.sovereignty || entry.Sovereignty || entry['Moederland_of_bestuur'] || '',
        alternativeDishes: entry.alternativeDishes || entry.Alternatieve_gerechten || '',
        influences: entry.influences || entry.Keukeninvloeden || ''
    };
}

function normalizeWorldRecipes(recipes) {
    const seen = new Set();
    return (Array.isArray(recipes) ? recipes : []).reduce((list, raw) => {
        const recipe = normalizeWorldCountryEntry(raw);
        if (!recipe) return list;
        const key = recipe.id || normalizeToken(recipe.country);
        if (seen.has(key)) return list;
        seen.add(key);
        list.push(recipe);
        return list;
    }, []);
}

function getCachedWorldData() {
    try {
        const raw = localStorage.getItem(getWorldDataCacheKey());
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed.timestamp || Date.now() - parsed.timestamp > WORLD_DATA_MAX_AGE) return null;
        return parsed;
    } catch (e) {
        return null;
    }
}

function loadScript(url) {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${url}"]`);
        if (existing) {
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new Error(`Failed to load script: ${url}`)));
            return;
        }
        const script = document.createElement('script');
        script.src = url;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
        document.head.appendChild(script);
    });
}

async function ensureWorldAssetsLoaded() {
    if (window.d3 && window.topojson) return;
    await Promise.all([
        loadScript('/node_modules/d3/dist/d3.min.js'),
        loadScript('/node_modules/topojson-client/dist/topojson-client.min.js')
    ]);
}

function setCachedWorldData(recipes, journey) {
    try {
        const payload = { timestamp: Date.now(), recipes, journey };
        localStorage.setItem(getWorldDataCacheKey(), JSON.stringify(payload));
    } catch (e) {
        console.warn('Unable to persist world data cache', e);
    }
}

function getFeatureNames(feature) {
    const props = feature.properties || {};
    return [
        props.name,
        props.name_long,
        props.admin,
        props.ADMIN,
        props.NAME,
        props.NAME_LONG,
        props.formal_en,
        props.region,
        props.continent,
        props.iso_a2,
        props.iso_a3,
        props.brk_name,
        props.name_sort,
        props.sovereignt,
        props.abbrev
    ]
        .filter(Boolean)
        .map(name => normalizeToken(name));
}

function findFeatureByCountry(countryName, features) {
    const sanitizedCountry = sanitizeCountryName(countryName);
    const normalizedCountry = normalizeToken(sanitizedCountry);
    if (!features || !features.length) return null;

    const override = countryLocationOverrides[normalizedCountry];
    if (override && override.name) {
        const normalizedOverride = normalizeToken(override.name);
        const exactOverride = features.find(f => getFeatureNames(f).includes(normalizedOverride));
        if (exactOverride) return exactOverride;
    }

    const alias = countryNameAliasMap[normalizedCountry];
    if (alias) {
        const normalizedAlias = normalizeToken(alias);
        const aliasMatch = features.find(f => getFeatureNames(f).includes(normalizedAlias));
        if (aliasMatch) return aliasMatch;
    }

    const exactMatch = features.find(f => getFeatureNames(f).some(name => name === normalizedCountry));
    if (exactMatch) return exactMatch;

    const partialMatch = features.find(f => getFeatureNames(f).some(name => name.includes(normalizedCountry) || normalizedCountry.includes(name)));
    if (partialMatch) return partialMatch;

    return null;
}

function isFeatureCooked(feature) {
    const cookedNames = new Set(worldJourney.map(j => normalizeToken(sanitizeCountryName(j.country))));
    const featureNames = getFeatureNames(feature);
    return featureNames.some(name => cookedNames.has(name) || Array.from(cookedNames).some(cooked => name.includes(cooked) || cooked.includes(name)));
}


async function loadWorldData(owner = '') {
    if (worldDataLoadingPromise) {
        return worldDataLoadingPromise;
    }
    const cached = getCachedWorldData();
    if (cached) {
        worldRecipes = normalizeWorldRecipes(cached.recipes || []);
        allWorldJourney = cached.journey || [];
        selectedJourneyOwner = selectedJourneyOwner || window.currentCookbookUser || 'all';
        worldJourney = getJourneyForOwner(selectedJourneyOwner);
    }

    worldDataLoadingPromise = (async () => {
        try {
            const [recipesRes, journeyRes] = await Promise.all([
                fetch('/api/world_recipes', { cache: 'no-store', headers: getAuthHeaders(false) }),
                fetch('/api/world_journey?owner=all', { cache: 'no-store', headers: getAuthHeaders(false) })
            ]);
            if (recipesRes.ok) worldRecipes = normalizeWorldRecipes(await recipesRes.json());
            if (journeyRes.ok) worldJourney = await journeyRes.json();
            allWorldJourney = worldJourney;
            selectedJourneyOwner = selectedJourneyOwner || window.currentCookbookUser || 'all';
            worldJourney = getJourneyForOwner(selectedJourneyOwner);
            if (!owner) setCachedWorldData(worldRecipes, worldJourney);
        } catch (e) {
            console.error('Kan wereldgegevens niet laden', e);
            if (!worldRecipes.length || !worldJourney.length) {
                const fallback = getCachedWorldData();
                if (fallback) {
                    worldRecipes = fallback.recipes || [];
                    allWorldJourney = fallback.journey || [];
                    worldJourney = getJourneyForOwner(selectedJourneyOwner);
                }
            }
        } finally {
            worldDataLoadingPromise = null;
        }
    })();

    return worldDataLoadingPromise;
}

const cachedWorldData = getCachedWorldData();
if (cachedWorldData) {
    worldRecipes = cachedWorldData.recipes || [];
    worldJourney = cachedWorldData.journey || [];
}

// --- GLOBALS AND DOM ---
const btnNavRandomizer = document.getElementById('nav-world-randomizer');
const btnNavJourney = document.getElementById('nav-world-journey');

const modalRandomizer = document.getElementById('world-randomizer-modal');
const modalJourney = document.getElementById('world-journey-modal');
const modalMemory = document.getElementById('memory-editor-modal');
const modalRandomizerContent = modalRandomizer ? modalRandomizer.querySelector('.modal-content') : null;

function closeRandomizerModal() {
    modalRandomizer.classList.remove('active');
    const existingResult = document.getElementById('randomizer-result');
    if (existingResult) existingResult.remove();
}

// Randomizer elements
const spinIntro = document.getElementById('randomizer-intro');
const spinView = document.getElementById('randomizer-spin-view');
const spinCountryDisplay = document.getElementById('spin-country-display');
const btnStartSpin = document.getElementById('btn-start-world-spin');

// --- RANDOMIZER LOGIC ---

btnNavRandomizer.addEventListener('click', async () => {
    await loadWorldData();
    modalRandomizer.classList.add('active');
    spinIntro.style.display = 'block';
    spinView.style.display = 'none';
    
    // Remove any existing result views
    const existingResult = document.getElementById('randomizer-result');
    if (existingResult) existingResult.remove();
});

if (modalRandomizer) {
    modalRandomizer.addEventListener('click', (e) => {
        if (e.target === modalRandomizer) {
            closeRandomizerModal();
        }
    });
}

const btnCloseRandomizer = document.getElementById('btn-close-randomizer');
if (btnCloseRandomizer) {
    btnCloseRandomizer.addEventListener('click', closeRandomizerModal);
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalRandomizer.classList.contains('active')) {
        closeRandomizerModal();
    }
});

btnStartSpin.addEventListener('click', async () => {
    await loadWorldData();

    spinIntro.style.display = 'none';
    spinView.style.display = 'flex';
    spinCountryDisplay.style.transform = 'translateY(0)';
    spinCountryDisplay.innerHTML = '';
    
    // Filter out cooked countries
    const cookedIds = worldJourney.map(j => j.id);
    const available = worldRecipes.filter(r => !cookedIds.includes(r.id));
    
    if (available.length === 0) {
        spinCountryDisplay.innerHTML = "🎉 Je hebt de HELE WERELD gekookt!";
        return;
    }

    if (spinTickTimer) {
        clearTimeout(spinTickTimer);
        spinTickTimer = null;
    }

    const extraAfter = Math.min(6, Math.max(0, available.length - 1));
    let spinArray = [];
    for (let i = 0; i < 4; i++) {
        spinArray = spinArray.concat([...available].sort(() => Math.random() - 0.5));
    }

    const maxBaseLength = 44;
    if (spinArray.length > maxBaseLength) spinArray.length = maxBaseLength;

    const finalCountry = available[Math.floor(Math.random() * available.length)];
    spinArray.push(finalCountry);
    for (let i = 0; i < extraAfter; i++) {
        const nextCountry = available[Math.floor(Math.random() * available.length)];
        spinArray.push(nextCountry);
    }
    currentRandomCountry = finalCountry;

    const finalIndex = spinArray.length - 1 - extraAfter;
    const itemHeight = 72;
    const visibleHeight = 450;
    const centerOffset = visibleHeight / 2 - itemHeight / 2;

    spinCountryDisplay.style.position = 'absolute';
    spinCountryDisplay.style.top = '0';
    spinCountryDisplay.style.left = '0';
    spinCountryDisplay.style.width = '100%';
    spinCountryDisplay.style.height = 'auto';
    spinCountryDisplay.style.transition = 'none';
    spinCountryDisplay.style.transform = `translateY(${centerOffset}px)`;
    spinCountryDisplay.style.overflow = 'visible';
    spinCountryDisplay.style.display = 'block';
    spinView.style.display = 'flex';
    spinView.style.overflow = 'hidden';

    let html = '';
    spinArray.forEach((c, idx) => {
        html += `<div style="height: ${itemHeight}px; display:flex; align-items:center; justify-content:center; font-size: 2.2rem; letter-spacing: 0.05em; font-weight: 700;">
                    <span style="margin-right:12px;">${c.flag || ''}</span> <span>${c.country}</span>
                 </div>`;
    });
    spinCountryDisplay.innerHTML = html;

    // Trigger reflow
    void spinCountryDisplay.offsetWidth;

    const spinDuration = 6000;
    spinCountryDisplay.style.transition = `transform ${spinDuration}ms cubic-bezier(0.1, 0.88, 0.3, 1)`;
    const targetY = -(finalIndex * itemHeight) + centerOffset;
    spinCountryDisplay.style.transform = `translateY(${targetY}px)`;

    const totalTicks = spinArray.length * 2;
    let tickCount = 0;
    const playTick = () => {
        if (tickCount < totalTicks) {
            if (window.playSound) window.playSound('click');
            tickCount++;
            spinTickTimer = setTimeout(playTick, 80 + tickCount * 15);
        }
    };
    playTick();

    setTimeout(() => {
        showRevealScreen(finalCountry);
    }, spinDuration + 500);
});

async function showRevealScreen(country) {
    if (spinTickTimer) {
        clearTimeout(spinTickTimer);
        spinTickTimer = null;
    }
    spinView.style.display = 'none';
    
    const div = document.createElement('div');
    div.id = 'randomizer-result';
    div.style.width = '100%';
    div.style.height = '100%';
    div.style.padding = 'var(--space-6)';
    div.style.overflowY = 'auto';
    div.style.background = '#fdfbf7';
    
    const dishes = (country.nationalDish || 'Onbekend').split(/[;]+/).map(d => d.trim()).filter(Boolean);
    const dishHtml = dishes.length
        ? dishes.map(d => `<a href="https://www.google.com/search?q=${encodeURIComponent(d + ' recept')}" target="_blank" style="color: inherit; text-decoration: underline; text-decoration-color: #111; cursor: pointer;">${d}</a>`).join(' <span style="font-size: 1.2rem; font-family: var(--font-mono); color: #888; text-decoration: none;">en/of</span> ')
        : 'Onbekend gerecht';

    const detailItems = [];
    const typeLabel = country.status || country.type;
    if (typeLabel) {
        detailItems.push({ label: 'Status / Type', value: typeLabel });
    }
    if (country.sovereignty) {
        detailItems.push({ label: 'Moederland / Bestuur', value: country.sovereignty });
    }
    if (country.region || country.continent) {
        detailItems.push({ label: 'Regio', value: country.region || country.continent });
    }
    if (country.alternativeDishes) {
        detailItems.push({ label: 'Alternatieve gerechten', value: country.alternativeDishes });
    }
    if (country.influences) {
        detailItems.push({ label: 'Keukeninvloeden', value: country.influences });
    }

    const detailHtml = detailItems.length ? detailItems.map(item => `
        <div style="background: rgba(0,85,164,0.03); padding: 14px 16px; border-radius: 14px; border: 1px solid rgba(0,85,164,0.08);">
            <div style="font-size: 0.75rem; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.14em; color: #225095; margin-bottom: 8px;">${item.label}</div>
            <div style="font-size: 0.95rem; color: #222;">${item.value}</div>
        </div>`).join('') : '';

    const displayCountry = country.country.replace(/^#+\s*/,'').trim();
    div.innerHTML = `
        <div style="max-width: 900px; margin: 0 auto; background: #fff; padding: var(--space-6); border-radius: 8px; box-shadow: 0 10px 40px rgba(0,0,0,0.08); position: relative; border: 1px solid #e6e6e6;">
            <button class="btn-close" onclick="document.getElementById('world-randomizer-modal').classList.remove('active')" style="position: absolute; right: 20px; top: 20px; z-index:10;">&times;</button>
            
            <div style="text-align: center; margin-bottom: var(--space-4);">
                <div style="font-size: 2rem;">${country.flag || ''}</div>
                <h2 style="font-family: var(--font-pixel); font-size: 2rem; color: #111; text-transform: none; margin-bottom: 8px;">${displayCountry}</h2>
                <p style="font-family: var(--font-mono); font-size: 1rem; color: #444;">Vandaag koken we</p>
            </div>
            
            <h1 style="font-family: var(--font-sans); font-size: 2rem; font-weight: 700; text-align: center; margin-bottom: var(--space-4); line-height: 1.2; color: #111;">
                ${dishHtml}
            </h1>
            
            <div id="reveal-globe-container" style="width: 150px; height: 150px; margin: 0 auto var(--space-4) auto; border-radius: 50%; overflow: hidden; box-shadow: inset 0 0 10px rgba(0,0,0,0.1);"></div>
            
            <div style="background: rgba(255,238,210,0.4); padding: var(--space-4); margin-bottom: var(--space-5); font-size: 1rem; text-align: left; border-radius: 14px; color: #2d2d2d; line-height: 1.55;">
                ${country.description || 'Geen beschrijving beschikbaar.'}
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: var(--space-5);">
                ${detailHtml}
                <div style="background: rgba(255,255,255,0.95); padding: 14px 16px; border-radius: 14px; border: 1px solid rgba(0,0,0,0.04);">
                    <div style="font-size: 0.75rem; font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.14em; color: #225095; margin-bottom: 8px;">Ingrediënten</div>
                    <div style="font-size: 0.95rem; color: #222;">${(country.ingredients || []).join(', ') || 'Onbekend'}</div>
                </div>
            </div>
            
            <div style="display: flex; gap: 16px; flex-wrap: wrap; justify-content: center;">
                <button class="btn btn-primary" onclick="openMemoryEditor('${country.id}', '${country.country.replace(/'/g, "\\'")}', '${country.nationalDish.replace(/'/g, "\\'")}')" style="font-size: 1.1rem; padding: 12px 28px;">🍽 Ik heb dit gekookt</button>
                <button class="btn" id="btn-spin-again" style="font-size: 1.1rem; padding: 12px 28px;">Spin opnieuw</button>
            </div>
        </div>
    `;
    
    modalRandomizer.querySelector('.modal-content').appendChild(div);
    
    // Draw mini globe
    if (!worldGeoJSON) {
        try {
            const res = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
            const topo = await res.json();
            worldGeoJSON = topojson.feature(topo, topo.objects.countries);
        } catch(e) {}
    }
    
    if (!window.countryMapping) {
        try {
            const mapRes = await fetch('/scripts/country_mapping.json');
            window.countryMapping = await mapRes.json();
        } catch(e) {}
    }
    
    await ensureWorldAssetsLoaded();
    if (worldGeoJSON && window.d3 && window.topojson) {
        let mappedId = country.id;
        if (window.countryMapping && window.countryMapping[country.id]) {
            mappedId = window.countryMapping[country.id];
        }
        const feature = worldGeoJSON.features.find(f => f.id === mappedId || f.properties.name === country.country);
        const center = feature ? d3.geoCentroid(feature) : [0, 0];
        
        const gW = 150, gH = 150;
        const svgG = d3.select('#reveal-globe-container').append('svg').attr('width', gW).attr('height', gH);
        
        const proj = d3.geoOrthographic()
            .scale(gH/2)
            .translate([gW/2, gH/2])
            .clipAngle(90)
            .rotate([-center[0], -center[1]]);
            
        const gPath = d3.geoPath().projection(proj);
        
        svgG.append('circle').attr('cx', gW/2).attr('cy', gH/2).attr('r', gH/2).attr('fill', '#e8f4f8');
        
        svgG.selectAll('path')
            .data(worldGeoJSON.features)
            .enter().append('path')
            .attr('d', gPath)
            .attr('fill', d => d === feature ? '#dd0100' : '#fdfaf6')
            .attr('stroke', '#ccc')
            .attr('stroke-width', 0.5);
    }
    
    document.getElementById('btn-spin-again').addEventListener('click', () => {
        div.remove();
        btnStartSpin.click();
    });
}

// --- WORLD JOURNEY (GLOBE & MEMORIES & SEARCH) ---

const worldSearchInput = document.getElementById('world-country-search');
const worldSearchResults = document.getElementById('world-search-results');

if (worldSearchInput) {
    worldSearchInput.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        if (!q) {
            worldSearchResults.style.display = 'none';
            return;
        }
        const matches = worldRecipes.filter(r => r.country.toLowerCase().includes(q) || (r.nationalDish && r.nationalDish.toLowerCase().includes(q)));
        worldSearchResults.innerHTML = '';
        if (matches.length > 0) {
            matches.slice(0, 5).forEach(m => {
                const d = document.createElement('div');
                d.style = "padding: 12px; cursor: pointer; border-bottom: 1px solid #eee; display: flex; align-items: center; gap: 8px;";
                const isCooked = worldJourney.some(j => j.id === m.id);
                d.innerHTML = `<span>${m.flag || ''}</span> <strong>${m.country}</strong> <span style="color:#888; font-size: 0.9rem;">- ${m.nationalDish}</span> <span style="margin-left:auto; font-size:0.8rem; font-family:var(--font-mono);">${isCooked ? 'GEKOOKT' : ''}</span>`;
                d.onclick = () => {
                    worldSearchResults.style.display = 'none';
                    worldSearchInput.value = '';
                    openMemoryEditor(m.id, m.country, m.nationalDish);
                };
                worldSearchResults.appendChild(d);
            });
            worldSearchResults.style.display = 'block';
        } else {
            worldSearchResults.innerHTML = '<div style="padding: 12px; color: #888;">Geen landen gevonden.</div>';
            worldSearchResults.style.display = 'block';
        }
    });

    document.addEventListener('click', (e) => {
        if(e.target !== worldSearchInput && e.target !== worldSearchResults) {
            worldSearchResults.style.display = 'none';
        }
    });
}

btnNavJourney.addEventListener('click', async () => {
    modalJourney.classList.add('active');
    await loadWorldData();
    renderJourneyStats();
    renderJourneyOwnerList();
    renderMemoriesGrid();
    initGlobe();
});

btnNavRandomizer.addEventListener('click', async () => {
    await loadWorldData();
    modalRandomizer.classList.add('active');
    spinIntro.style.display = 'block';
    spinView.style.display = 'none';
    const existingResult = document.getElementById('randomizer-result');
    if (existingResult) existingResult.remove();
});

document.getElementById('btn-close-journey').addEventListener('click', () => {
    modalJourney.classList.remove('active');
});

function renderJourneyStats() {
    const total = worldRecipes.length || 195;
    const cooked = worldJourney.length;
    document.getElementById('journey-stats-counter').textContent = `${cooked} / ${total} landen ontdekt`;
    document.getElementById('stat-cooked').textContent = cooked;
    
    const avgRating = cooked > 0 ? (worldJourney.reduce((sum, j) => sum + parseFloat(j.rating), 0) / cooked).toFixed(1) : '-';
    document.getElementById('stat-rating').textContent = avgRating;
}

function getCurrentJourneyUser() {
    return window.currentCookbookUser || localStorage.getItem('htmeal_session_user') || localStorage.getItem('htmeal_user') || '';
}

function getJourneyColor(owner) {
    const currentUser = getCurrentJourneyUser();
    const normalized = String(owner || '').trim().toLowerCase();
    if (!normalized || normalized === currentUser.toLowerCase()) {
        return '#fac901';
    }

    const colors = ['#3a8ddb', '#d64545', '#2e8b57'];
    const hash = Array.from(normalized).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    return colors[hash % colors.length];
}

function renderOwnerButtons(owner, currentUser, selectedOwner) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.style = 'padding: 0.5rem 0.75rem; white-space: nowrap;';
    button.textContent = owner === currentUser ? `Jouw Culinaire Logboek` : `${escapeHtml(owner)}'s Culinaire Logboek`;
    if (selectedOwner === owner) {
        button.style.background = '#222';
        button.style.color = '#fff';
    }
    button.addEventListener('click', async () => {
        selectJourneyOwner(owner);
        renderJourneyStats();
        renderJourneyOwnerList();
        renderMemoriesGrid();
        await initGlobe();
    });
    return button;
}

function getJourneyForOwner(owner) {
    const normalized = String(owner || '').trim();
    const currentUser = getCurrentJourneyUser();
    if (normalized === 'all' || !normalized) {
        return allWorldJourney.slice();
    }
    if (normalized === currentUser) {
        return allWorldJourney.filter(entry => String(entry.owner || '').trim() === currentUser);
    }
    return allWorldJourney.filter(entry => String(entry.owner || '').trim() === normalized);
}

function selectJourneyOwner(owner) {
    selectedJourneyOwner = owner || getCurrentJourneyUser() || 'all';
    worldJourney = getJourneyForOwner(selectedJourneyOwner);
}

function renderJourneyOwnerList(selectedOwner = selectedJourneyOwner) {
    const ownerList = document.getElementById('journey-owner-list');
    const note = document.getElementById('journey-readonly-note');
    if (!ownerList) return;

    const owners = Array.from(new Set(allWorldJourney.map(entry => String(entry.owner || '').trim()).filter(Boolean)));
    const currentUser = getCurrentJourneyUser();
    ownerList.innerHTML = '';

    const mineBtn = document.createElement('button');
    mineBtn.type = 'button';
    mineBtn.className = 'btn';
    mineBtn.style = 'padding: 0.5rem 0.75rem; white-space: nowrap;';
    mineBtn.textContent = currentUser ? 'Jouw Culinaire Logboek' : 'Jouw logboek';
    if (selectedOwner === currentUser || (!selectedOwner && !currentUser)) {
        mineBtn.style.background = '#222';
        mineBtn.style.color = '#fff';
    }
    mineBtn.addEventListener('click', async () => {
        selectJourneyOwner(currentUser);
        renderJourneyStats();
        renderJourneyOwnerList();
        renderMemoriesGrid();
        await initGlobe();
    });
    ownerList.appendChild(mineBtn);

    owners.filter(owner => owner && owner !== currentUser).forEach(owner => {
        ownerList.appendChild(renderOwnerButtons(owner, currentUser, selectedOwner));
    });

    if (note) {
        if (selectedOwner && selectedOwner !== currentUser) {
            note.textContent = 'Je bekijkt het logboek van ' + selectedOwner + '. Deze items zijn alleen-lezen.';
        } else {
            note.textContent = 'Je bekijkt je eigen wereldreis. Je kunt hier entries bewerken en verwijderen.';
        }
    }
}


function renderMemoriesGrid() {
    const list = document.getElementById('journey-memories-grid');
    list.innerHTML = '';
    
    if (!worldJourney.length) {
        list.innerHTML = '<div style="grid-column:1/-1; padding: 32px; text-align:center; color:#555;">Er zijn nog geen landen gelogd voor deze gebruiker. Kies een ander logboek of start je eigen wereldreis.</div>';
        return;
    }

    const currentUser = getCurrentJourneyUser();
    const selectedOwner = list.dataset.selectedOwner || currentUser;

    worldJourney.forEach(entry => {
        const cleanCountry = sanitizeCountryName(entry.country);
        const recipeDef = worldRecipes.find(r => r.id === entry.id);
        const countryFlag = recipeDef ? (recipeDef.flag || '') : '';
        const recipeLink = entry.recipeId ? `<a href="#" onclick="fetchRecipes('tag:wereldreis'); document.getElementById('world-journey-modal').classList.remove('active'); return false;" style="font-size:0.9rem; color:#111; text-decoration: underline;">Bekijk Opgeslagen Recept</a>` : '';

        const div = document.createElement('div');
        div.className = 'memory-card';
        div.style = "background: #fff; padding: var(--space-4); border: 1px solid #eee; border-radius: 4px; box-shadow: 0 4px 10px rgba(0,0,0,0.05); cursor: pointer; transition: transform 0.2s;";
        div.onmouseover = () => div.style.transform = 'scale(1.02)';
        div.onmouseout = () => div.style.transform = 'scale(1)';
        const readOnly = entry.owner && entry.owner !== currentUser;
        if (!readOnly) {
            div.onclick = () => openMemoryEditor(entry.id, cleanCountry, entry.dish);
        }
        
        div.innerHTML = `
            <div style="font-size: 2rem;">${countryFlag}</div>
            <h3 style="font-family: var(--font-pixel); color: #111; font-size: 1.5rem;">${cleanCountry}</h3>
            <div style="font-family: var(--font-mono); font-weight: bold; margin-bottom: 8px; color: #111;">${entry.dish}</div>
            <div style="color: #f1c40f; margin-bottom: 8px;">${'★'.repeat(Math.floor(entry.rating))}${(entry.rating % 1 !== 0) ? '½' : ''}${'☆'.repeat(5 - Math.ceil(entry.rating))}</div>
            <div style="font-style: italic; color: #555; margin-bottom: 12px; font-size: 0.9rem;">"${entry.story}"</div>
            <div style="display:flex; justify-content:space-between; align-items:flex-end; gap:8px; flex-wrap:wrap;">
                <div style="font-size: 0.8rem; color: #aaa; font-family: var(--font-mono);">${entry.date}</div>
                <div style="font-size: 0.8rem; color: #777; font-family: var(--font-mono);">${entry.owner ? escapeHtml(entry.owner) : 'Jouw logboek'}</div>
                ${recipeLink}
            </div>
        `;
        list.appendChild(div);
    });
}

// --- D3 GLOBE ---

async function initGlobe() {
    const container = document.getElementById('globe-container');
    if (!container) return;
    if (typeof d3 === 'undefined') {
        container.innerHTML = '<div style="padding: 24px; color: #666;">De wereldkaart kan momenteel niet worden geladen.</div>';
        return;
    }
    container.innerHTML = '';
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    const svg = d3.select('#globe-container')
        .append('svg')
        .attr('width', width)
        .attr('height', height);

    // Ocean
    svg.append('circle')
        .attr('cx', width/2).attr('cy', height/2)
        .attr('r', height/2 - 10)
        .attr('fill', '#e8f4f8');

    const projection = d3.geoOrthographic()
        .scale(height/2 - 10)
        .translate([width/2, height/2])
        .clipAngle(90);

    const path = d3.geoPath().projection(projection);

    await ensureWorldAssetsLoaded();
    if (!worldGeoJSON) {
        const res = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
        const topo = await res.json();
        worldGeoJSON = topojson.feature(topo, topo.objects.countries);
    }
    
    if (!window.countryMapping) {
        try {
            const mapRes = await fetch('/scripts/country_mapping.json');
            window.countryMapping = await mapRes.json();
        } catch(e) {}
    }
    
    const g = svg.append('g');

    const journeyColor = getJourneyColor(selectedJourneyOwner);
    g.selectAll('path')
        .data(worldGeoJSON.features)
        .enter().append('path')
        .attr('d', path)
        .attr('fill', d => {
            return worldJourney.some(j => {
                let mId = j.id;
                if (window.countryMapping && window.countryMapping[j.id]) mId = window.countryMapping[j.id];
                return mId === d.id;
            }) ? journeyColor : '#fdfaf6';
        })
        .attr('stroke', '#ccc')
        .attr('stroke-width', 0.5);
        
    let time = Date.now();
    d3.timer(() => {
        const dt = Date.now() - time;
        projection.rotate([dt * 0.01, -10]);
        svg.selectAll('path').attr('d', path);
    });
}

// --- MEMORY EDITOR ---

document.getElementById('btn-close-memory-editor').addEventListener('click', () => {
    modalMemory.classList.remove('active');
});

// Explicitly attach to window so HTML inline onclick can access it
window.deleteMemory = async function(id) {
    if (!confirm('Weet je zeker dat je deze wilt verwijderen uit je Wereldreis?')) return;
    try {
        const res = await fetch('/api/world_journey/' + id, { method: 'DELETE', headers: getAuthHeaders(false) });
        if (res.ok) {
            worldJourney = worldJourney.filter(j => j.id !== id);
            renderMemoriesGrid();
            modalMemory.classList.remove('active');
            if(window.playSound) window.playSound('paper');
        }
    } catch (e) {
        console.error(e);
        alert('Fout bij verwijderen');
    }
};

window.openMemoryEditor = function(id, countryName, dish) {
    modalMemory.classList.add('active');
    const cleanCountry = sanitizeCountryName(countryName);
    document.getElementById('memory-country-id').value = id;
    document.getElementById('memory-country-name').textContent = cleanCountry;
    const dishName = document.getElementById('memory-dish-name');
    if(dishName) dishName.textContent = (dish || '').replace(/;/g, ' en/of ');
    const dishInput = document.getElementById('memory-dish-input');
    
    // Existing entry data if available
    const existing = worldJourney.find(j => j.id === id);
    const existingDeleteBtn = document.getElementById('btn-delete-memory');
    if (existingDeleteBtn) existingDeleteBtn.remove();

    if(existing) {
        document.getElementById('memory-rating').value = existing.rating || 4;
        document.getElementById('memory-story').value = existing.story || '';
        document.getElementById('memory-date').value = existing.date || new Date().toISOString().split('T')[0];
        document.getElementById('memory-cooked-toggle').checked = true;
        dishInput.value = existing.dish || (dish || '').replace(/;/g, ' en/of ');
        
        const deleteBtn = document.createElement('button');
        deleteBtn.id = 'btn-delete-memory';
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn';
        deleteBtn.style = 'background: transparent; color: #dd0100; border: 1px solid #dd0100; margin-top: 16px; width: 100%;';
        deleteBtn.textContent = 'Verwijder uit Wereldreis';
        deleteBtn.onclick = () => window.deleteMemory(id);
        document.getElementById('memory-form').appendChild(deleteBtn);
    } else {
        document.getElementById('memory-rating').value = 4;
        document.getElementById('memory-story').value = '';
        document.getElementById('memory-date').valueAsDate = new Date();
        document.getElementById('memory-cooked-toggle').checked = true;
        dishInput.value = (dish || '').replace(/;/g, ' en/of ');
    }
    
    updateStarRatingUI();
    
    // Clear recipe import inputs
    document.getElementById('memory-recipe-import').value = '';
    document.getElementById('memory-save-to-cookbook').checked = false;
}

// Star rating logic
const stars = document.querySelectorAll('#star-rating-container .star');
const ratingInput = document.getElementById('memory-rating');
const ratingText = document.getElementById('star-rating-text');

function updateStarRatingUI() {
    const val = parseFloat(ratingInput.value);
    if(ratingText) ratingText.textContent = val.toFixed(1);
    stars.forEach((star, idx) => {
        const starVal = idx + 1;
        if (val >= starVal) {
            star.textContent = '★';
            star.style.color = '#f1c40f';
        } else if (val >= starVal - 0.5) {
            star.textContent = '★'; 
            star.style.color = '#f1c40f';
            star.style.opacity = '0.7';
        } else {
            star.textContent = '★';
            star.style.color = '#ccc';
            star.style.opacity = '1';
        }
    });
}

stars.forEach((star, idx) => {
    star.addEventListener('mousemove', (e) => {
        const rect = star.getBoundingClientRect();
        const isHalf = (e.clientX - rect.left) < (rect.width / 2);
        const val = idx + (isHalf ? 0.5 : 1);
        
        stars.forEach((s, i) => {
            if (i < idx) { s.style.color = '#f1c40f'; s.style.opacity = '1'; }
            else if (i === idx) {
                s.style.color = '#f1c40f';
                s.style.opacity = isHalf ? '0.7' : '1';
            }
            else { s.style.color = '#ccc'; s.style.opacity = '1'; }
        });
        if(ratingText) ratingText.textContent = val.toFixed(1);
    });
    
    star.addEventListener('mouseout', updateStarRatingUI);
    
    star.addEventListener('click', (e) => {
        const rect = star.getBoundingClientRect();
        const isHalf = (e.clientX - rect.left) < (rect.width / 2);
        ratingInput.value = idx + (isHalf ? 0.5 : 1);
        updateStarRatingUI();
    });
});

document.getElementById('btn-save-memory').addEventListener('click', async () => {
    const id = document.getElementById('memory-country-id').value;
    const countryName = document.getElementById('memory-country-name').textContent;
    const dishInput = document.getElementById('memory-dish-input');
    const dishName = dishInput ? dishInput.value.trim() : document.getElementById('memory-dish-name').textContent;
    const cookedToggle = document.getElementById('memory-cooked-toggle');
    const isCooked = cookedToggle ? cookedToggle.checked : true;

    const importText = document.getElementById('memory-recipe-import').value.trim();
    const saveToCookbook = document.getElementById('memory-save-to-cookbook').checked;
    
    // If the user unchecks cooked, remove the journey entry
    if (!isCooked) {
        await fetch('/api/world_journey', {
            method: 'POST',
            headers: getUserHeaders ? getUserHeaders(true) : {},
            body: JSON.stringify({ remove: true, id })
        });
        modalMemory.classList.remove('active');
        if (document.getElementById('randomizer-result')) document.getElementById('randomizer-result').remove();
        modalRandomizer.classList.remove('active');
        await loadWorldData();
        btnNavJourney.click();
        return;
    }

    // Optional: Save the recipe to the main cookbook when requested
    let savedRecipeId = null;
    if (saveToCookbook) {
        const btn = document.getElementById('btn-save-memory');
        const oldText = btn.textContent;
        try {
            btn.textContent = 'Recept aan het inladen...';
            btn.disabled = true;

            let recipeData = {};
            if (importText) {
                const res = await fetch('/api/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: importText })
                });
                if (!res.ok) throw new Error('Import failed');
                recipeData = await res.json();
            }

            const cleanTitle = dishName || recipeData.title || 'Recept';
            const normalizedCountry = countryName || '';
            if (!recipeData.title) {
                recipeData.title = `${cleanTitle} - ${normalizedCountry}`;
            } else if (normalizedCountry && !recipeData.title.toLowerCase().includes(normalizedCountry.toLowerCase())) {
                recipeData.title = `${recipeData.title} - ${normalizedCountry}`;
            }

            recipeData.description = recipeData.description || '';
            recipeData.source = recipeData.source || importText || '';
            recipeData.tags = recipeData.tags || [];
            if (normalizedCountry && !recipeData.tags.includes(normalizedCountry.toLowerCase())) {
                recipeData.tags.push(normalizedCountry.toLowerCase());
            }
            if (!recipeData.tags.includes('wereldreis')) {
                recipeData.tags.push('wereldreis');
            }

            const saveRes = await fetch('/api/recipe', {
                method: 'POST',
                headers: getAuthHeaders(true),
                body: JSON.stringify({ recipe: recipeData })
            });
            if (!saveRes.ok) throw new Error('Save failed');
            const savedRecipe = await saveRes.json();
            savedRecipeId = savedRecipe.recipe ? savedRecipe.recipe.id : savedRecipe.id;
        } catch(e) {
            console.error('Kon recept niet importeren', e);
            btn.textContent = 'Import mislukt';
            setTimeout(() => { btn.textContent = oldText; }, 1800);
        } finally {
            btn.disabled = false;
            if (btn.textContent === 'Recept aan het inladen...') {
                btn.textContent = oldText;
            }
        }
    }

    const entry = {
        id: id,
        country: sanitizeCountryName(countryName),
        dish: dishName,
        rating: document.getElementById('memory-rating').value,
        story: document.getElementById('memory-story').value,
        date: document.getElementById('memory-date').value,
        recipeId: savedRecipeId
    };
    
    const res = await fetch('/api/world_journey', {
        method: 'POST',
        headers: getUserHeaders ? getUserHeaders(true) : {},
        body: JSON.stringify({ entry: entry })
    });
    const data = await res.json();
    
    // Show achievement unlock notifications
    if (data.awarded_achievements && data.awarded_achievements.length > 0 && window.showAchievementUnlocked) {
      data.awarded_achievements.forEach(achievementId => {
        // Fetch the achievement details from the achievements endpoint
        fetch('/api/achievements', { headers: getUserHeaders ? getUserHeaders() : {} })
          .then(r => r.json())
          .then(d => {
            const achievement = d.achievements?.find(a => a.id === achievementId);
            if (achievement) {
              window.showAchievementUnlocked(achievement);
            }
          })
          .catch(e => console.error('Error fetching achievement:', e));
      });
    }
    
    modalMemory.classList.remove('active');
    
    const resEl = document.getElementById('randomizer-result');
    if (resEl) resEl.remove();
    modalRandomizer.classList.remove('active');
    
    await loadWorldData();
    btnNavJourney.click();
});
