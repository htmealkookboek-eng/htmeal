// Postcard & Stamp Logic
const postcardModal = document.getElementById('postcard-modal');
const postcardCard = document.getElementById('postcard-card');

function openPostcard(recipe) {
    if (!recipe) return;
    playSound('paper');
    
    // Front
    document.getElementById('postcard-img').src = recipe.image || '';
    document.getElementById('postcard-title').textContent = recipe.title;
    
    // Back
    document.getElementById('postcard-desc').innerHTML = `
        <h2 style="font-family: var(--font-hand); font-size:2rem; margin-bottom:1rem;">Groetjes uit de keuken!</h2>
        <p>Ik dacht dat je dit recept wel leuk zou vinden:</p>
        <p style="font-weight:700; margin: 10px 0;">${recipe.title}</p>
        <p>Tijd: ${recipe.cooking_time || 30}m</p>
        <p>Voor: ${recipe.servings || 4} personen</p>
        <p style="font-family: var(--font-hand); font-size:1.5rem; margin-top:20px; color: var(--color-secondary);">Liefs,</p>
        <p style="font-family: var(--font-hand); font-size:1.5rem;">De Chef</p>
    `;
    
    // Stamp Generation
    generateStamp(recipe);
    
    postcardCard.classList.remove('flipped');
    postcardModal.classList.add('active');
}

function generateStamp(recipe) {
    let origin = 'HTMEAL';
    if (recipe.source && recipe.source.startsWith('http')) {
        try {
            origin = new URL(recipe.source).hostname.replace('www.', '').toUpperCase();
        } catch(e) {}
    } else if (recipe.source) {
        origin = recipe.source.toUpperCase();
    }
    
    let color = 'var(--color-accent)'; // default red
    if (origin.includes('AH') || origin.includes('ALLERHANDE')) color = 'var(--color-secondary)'; // blue
    if (origin.includes('MILJUSCHKA')) color = '#e91e63'; // pink
    
    const svg = `
    <svg viewBox="0 0 100 120" style="width:100%; height:100%;">
        <rect x="0" y="0" width="100" height="120" fill="var(--color-paper)" />
        <rect x="5" y="5" width="90" height="110" fill="none" stroke="${color}" stroke-width="2" />
        <circle cx="50" cy="50" r="30" fill="none" stroke="${color}" stroke-width="1" />
        <path d="M40 50 Q50 30 60 50 T40 60" fill="none" stroke="${color}" stroke-width="2" />
        <text x="50" y="95" font-family="monospace" font-size="12" font-weight="bold" fill="${color}" text-anchor="middle" letter-spacing="1">${origin.substring(0,10)}</text>
        <text x="50" y="105" font-family="monospace" font-size="8" fill="${color}" text-anchor="middle">1E KLAS</text>
    </svg>`;
    
    document.getElementById('postcard-stamp').innerHTML = svg;
}

document.getElementById('btn-open-share').onclick = () => {
    openPostcard(currentViewRecipe);
};

document.getElementById('btn-close-postcard').onclick = () => {
    playSound('paper');
    postcardModal.classList.remove('active');
};

document.getElementById('btn-flip-postcard').onclick = () => {
    playSound('paper');
    postcardCard.classList.toggle('flipped');
};

document.getElementById('btn-download-postcard').onclick = async () => {
    playSound('click');
    const btn = document.getElementById('btn-download-postcard');
    const ogText = btn.textContent;
    btn.textContent = 'Opslaan...';
    
    // We create a temporary canvas to draw the card
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');
    
    // Draw background
    ctx.fillStyle = '#f9f7f4';
    ctx.fillRect(0, 0, 1200, 800);
    
    // Draw Front
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(50, 50, 500, 700);
    ctx.strokeStyle = '#e0dcd5';
    ctx.strokeRect(50, 50, 500, 700);
    
    const imgElement = document.getElementById('postcard-img');
    try {
        ctx.drawImage(imgElement, 50, 50, 500, 600);
    } catch(e) {}
    
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(50, 600, 500, 100);
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(currentViewRecipe.title, 80, 660);
    
    // Draw Back
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(650, 50, 500, 700);
    ctx.strokeStyle = '#e0dcd5';
    ctx.strokeRect(650, 50, 500, 700);
    
    ctx.beginPath();
    ctx.moveTo(900, 100);
    ctx.lineTo(900, 700);
    ctx.strokeStyle = '#e32636';
    ctx.globalAlpha = 0.3;
    ctx.stroke();
    ctx.globalAlpha = 1.0;
    
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '24px sans-serif';
    ctx.fillText("Groetjes uit de keuken!", 680, 120);
    ctx.font = '16px sans-serif';
    ctx.fillText("Tijd: " + (currentViewRecipe.cooking_time||30) + "m", 680, 200);
    ctx.fillText("Voor: " + (currentViewRecipe.servings||4) + " p", 680, 230);
    
    ctx.font = 'italic 24px serif';
    ctx.fillText("Liefs, De Chef", 680, 650);
    
    // Download
    const link = document.createElement('a');
    link.download = `htmeal-${currentViewRecipe.title.toLowerCase().replace(/\\s+/g, '-')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    
    btn.textContent = ogText;
};
