const referenceSelect = document.getElementById('reference');
const textInput = document.getElementById('text-input');
const widthInput = document.getElementById('width');
const heightInput = document.getElementById('height');
const thicknessSelect = document.getElementById('thickness');
const finishSelect = document.getElementById('finish');
const errorsEl = document.getElementById('errors');
const letterCountEl = document.getElementById('letter-count');

const baseCostEl = document.getElementById('base-cost');
const thicknessSurchargeEl = document.getElementById('thickness-surcharge');
const finishSurchargeEl = document.getElementById('finish-surcharge');
const packingFeeEl = document.getElementById('packing-fee');
const totalEl = document.getElementById('total');
const roundedTotalEl = document.getElementById('rounded-total');
const tierDisplayEl = document.getElementById('tier-display');

let pricingData = null;
let manifest = [];

const finishOrder = [
  'Paint',
  'Avery 4500',
  'Avery 5500',
  '3M 3630',
  '3M 3635',
  'UV Printing',
];

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        i += 1;
      }
      row.push(cell);
      if (row.some((value) => value.trim() !== '')) {
        rows.push(row);
      }
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim() !== '')) {
      rows.push(row);
    }
  }

  return rows;
}

function parsePrice(value) {
  if (!value) return 0;
  const cleaned = value
    .replace(/US\$/gi, '')
    .replace(/¥/g, '')
    .replace(/,/g, '')
    .trim();
  const parsed = Number.parseFloat(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parsePercent(value) {
  if (!value) return 0;
  const cleaned = value.replace('%', '').trim();
  const parsed = Number.parseFloat(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed / 100;
}

function parseSize(value) {
  if (!value) return null;
  const trimmed = value.replace(/cm/gi, '').trim();
  if (trimmed.includes('-')) {
    const [min, max] = trimmed.split('-').map((part) => Number.parseFloat(part));
    if (Number.isNaN(min) || Number.isNaN(max)) return null;
    return { minCm: min, maxCm: max };
  }
  if (trimmed.startsWith('＞')) {
    const min = Number.parseFloat(trimmed.replace('＞', '').trim());
    if (Number.isNaN(min)) return null;
    return { minCm: min, maxCm: null };
  }
  return null;
}

function formatMoney(value) {
  return `$${value.toFixed(2)}`;
}

function formatRounded(value) {
  return `$${Math.ceil(value).toLocaleString('en-US')}`;
}

function buildDropdown(selectEl, options, placeholder) {
  selectEl.innerHTML = '';
  if (placeholder) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = placeholder;
    selectEl.appendChild(option);
  }
  options.forEach((option) => {
    const el = document.createElement('option');
    el.value = option.value;
    el.textContent = option.label;
    selectEl.appendChild(el);
  });
}

async function loadManifest() {
  const response = await fetch('data/manifest.json');
  manifest = await response.json();
  referenceSelect.innerHTML = '';
  manifest.forEach((item, index) => {
    const option = document.createElement('option');
    option.value = item.file;
    option.textContent = item.label || item.reference || `Ref ${index + 1}`;
    referenceSelect.appendChild(option);
  });
  if (manifest.length > 0) {
    referenceSelect.value = manifest[0].file;
    await loadPricing(manifest[0].file);
  }
}

async function loadPricing(file) {
  const response = await fetch(file);
  const csvText = await response.text();
  pricingData = parsePricing(csvText);
  hydrateSelectors();
  recalc();
}

function parsePricing(csvText) {
  const rows = parseCSV(csvText).map((row) => row.map((cell) => cell.trim()));

  const letters = [];
  const thicknessOptions = [];
  const finishOptions = new Map();
  const packing = { price: 0, min: 0, unit: 'sq.m' };

  let currentType = '';

  rows.forEach((row) => {
    const sizeCell = row[0];
    const priceCell = row[1];
    const unitCell = row[2];
    const typeCell = row[4];
    const optionCell = row[5];
    const pctCell = row[6];
    const packingType = row[8];
    const packingPrice = row[9];
    const packingUnit = row[10];
    const packingMin = row[11];

    if (sizeCell && (sizeCell.includes('cm') || sizeCell.includes('＞'))) {
      const size = parseSize(sizeCell);
      if (size) {
        letters.push({
          ...size,
          price: parsePrice(priceCell),
          unit: unitCell || '',
          label: sizeCell,
        });
      }
    }

    if (typeCell) {
      currentType = typeCell;
    }

    if (optionCell && pctCell) {
      const pct = parsePercent(pctCell);
      if (currentType.toLowerCase().includes('thinck')) {
        const mmMatch = optionCell.match(/(\d+)\s*mm/i);
        if (mmMatch) {
          thicknessOptions.push({
            mm: Number.parseInt(mmMatch[1], 10),
            pct,
          });
        }
      } else if (currentType.toLowerCase().includes('vinyl')) {
        finishOptions.set(optionCell, pct);
      } else if (currentType.toLowerCase().includes('printing')) {
        finishOptions.set(optionCell, pct);
      }
    }

    if (packingType && packingType.toLowerCase().includes('carton')) {
      packing.price = parsePrice(packingPrice);
      packing.min = parsePrice(packingMin);
      packing.unit = packingUnit || 'sq.m';
    }
  });

  thicknessOptions.sort((a, b) => a.mm - b.mm);

  return {
    letters,
    thicknessOptions,
    finishOptions,
    packing,
  };
}

function hydrateSelectors() {
  if (!pricingData) return;

  const thicknessItems = pricingData.thicknessOptions.map((option) => ({
    value: option.mm,
    label: `${option.mm} mm (+${(option.pct * 100).toFixed(0)}%)`,
  }));

  buildDropdown(thicknessSelect, thicknessItems, 'Select thickness');
  thicknessSelect.value = '30';

  const finishItems = finishOrder.map((label) => {
    if (label === 'Paint') {
      return { value: 'Paint', label: 'Paint (0%)' };
    }
    const pct = pricingData.finishOptions.get(label) || 0;
    return { value: label, label: `${label} (+${(pct * 100).toFixed(0)}%)` };
  });

  buildDropdown(finishSelect, finishItems, 'Select finish');
  finishSelect.value = 'Paint';
}

function getTier(heightCm) {
  if (!pricingData) return null;
  return pricingData.letters.find((tier) => {
    if (tier.maxCm === null) {
      return heightCm > tier.minCm;
    }
    return heightCm >= tier.minCm && heightCm <= tier.maxCm;
  });
}

function getSqmTierForSmallHeight() {
  if (!pricingData) return null;
  return (
    pricingData.letters.find(
      (tier) => tier.unit === 'sq.m' && tier.minCm === 20 && tier.maxCm === 25
    ) || pricingData.letters.find((tier) => tier.unit === 'sq.m') || null
  );
}

function recalc() {
  errorsEl.textContent = '';

  const textValue = textInput.value.trim();
  const widthCm = Number.parseFloat(widthInput.value);
  const heightCm = Number.parseFloat(heightInput.value);
  const thicknessMm = Number.parseInt(thicknessSelect.value, 10);
  const finishLabel = finishSelect.value;

  const errors = [];
  if (!Number.isFinite(widthCm) || widthCm <= 0) {
    errors.push('Enter a valid width.');
  }
  if (!Number.isFinite(heightCm) || heightCm <= 0) {
    errors.push('Enter a valid height.');
  }
  const letterCount = textValue.replace(/\s+/g, '').length || 0;
  if (letterCountEl) {
    letterCountEl.textContent = `Letters: ${letterCount}`;
  }
  if (!Number.isFinite(thicknessMm)) {
    errors.push('Select a thickness.');
  }
  if (!finishLabel) {
    errors.push('Select a finish.');
  }

  if (errors.length > 0 || !pricingData) {
    errorsEl.textContent =
      'Enter text de produce (leave empty if no text), product refercece, width, height  and choose options as needed';
    updateOutputs(0, 0, 0, 0, 0);
    tierDisplayEl.textContent = 'Tier: —';
    return;
  }

  let tier = getTier(heightCm);
  if (!tier) {
    errorsEl.textContent = 'Height is outside pricing tiers.';
    updateOutputs(0, 0, 0, 0, 0);
    tierDisplayEl.textContent = 'Tier: —';
    return;
  }

  const hasText = letterCount > 0;
  if (!hasText && heightCm <= 20) {
    tier = getSqmTierForSmallHeight() || tier;
  }

  const areaM2 = (widthCm * heightCm) / 10000;
  let base = 0;
  if (hasText && heightCm <= 20) {
    const perLetter = heightCm * tier.price;
    base = perLetter * letterCount;
  } else {
    base = areaM2 * tier.price;
  }

  const thicknessOption = pricingData.thicknessOptions.find(
    (option) => option.mm === thicknessMm
  );
  const thicknessPct = thicknessOption ? thicknessOption.pct : 0;

  const finishPct = finishLabel === 'Paint'
    ? 0
    : pricingData.finishOptions.get(finishLabel) || 0;

  const thicknessSurcharge = base * thicknessPct;
  const finishSurcharge = base * finishPct;
  const subtotal = base + thicknessSurcharge + finishSurcharge;

  const packingFee = Math.max(areaM2 * pricingData.packing.price, pricingData.packing.min);
  const total = subtotal + packingFee;

  updateOutputs(base, thicknessSurcharge, finishSurcharge, packingFee, total);
  tierDisplayEl.textContent = `Tier: ${tier.label}`;
}

function updateOutputs(base, thicknessSurcharge, finishSurcharge, packingFee, total) {
  baseCostEl.textContent = formatMoney(base);
  thicknessSurchargeEl.textContent = formatMoney(thicknessSurcharge);
  finishSurchargeEl.textContent = formatMoney(finishSurcharge);
  packingFeeEl.textContent = formatMoney(packingFee);
  totalEl.textContent = formatMoney(total);
  roundedTotalEl.textContent = formatRounded(total);
}

referenceSelect.addEventListener('change', (event) => {
  loadPricing(event.target.value);
});

[textInput, widthInput, heightInput, thicknessSelect, finishSelect].forEach((el) => {
  el.addEventListener('input', recalc);
  el.addEventListener('change', recalc);
});

loadManifest();
