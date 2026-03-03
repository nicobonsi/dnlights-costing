const referenceSelect = document.getElementById('reference');
const textInput = document.getElementById('text-input');
const widthInput = document.getElementById('width');
const heightInput = document.getElementById('height');
const thicknessSelect = document.getElementById('thickness');
const colorSelect = document.getElementById('color');
const finishSelect = document.getElementById('finish');
const deliveryModeSelect = document.getElementById('delivery-mode');
const errorsEl = document.getElementById('errors');
const letterCountEl = document.getElementById('letter-count');

const baseCostEl = document.getElementById('base-cost');
const thicknessSurchargeEl = document.getElementById('thickness-surcharge');
const colorSurchargeEl = document.getElementById('color-surcharge');
const finishSurchargeEl = document.getElementById('finish-surcharge');
const packingFeeEl = document.getElementById('packing-fee');
const powerSuppliesEl = document.getElementById('power-supplies');
const expressDeliveryEl = document.getElementById('express-delivery');
const totalEl = document.getElementById('total');
const roundedTotalEl = document.getElementById('rounded-total');
const tierDisplayEl = document.getElementById('tier-display');

let pricingModel = null;
let activeReference = null;

function formatMoney(value) {
  return `$${value.toFixed(2)}`;
}

function formatRounded(value) {
  return `$${Math.ceil(value).toLocaleString('en-US')}`;
}

function buildDropdown(selectEl, options) {
  selectEl.innerHTML = '';
  options.forEach((option) => {
    const el = document.createElement('option');
    el.value = option.value;
    el.textContent = option.label;
    selectEl.appendChild(el);
  });
}

function pctLabel(pct) {
  const sign = pct > 0 ? '+' : '';
  return `${sign}${(pct * 100).toFixed(0)}%`;
}

function findReference(referenceId) {
  if (!pricingModel) return null;
  return pricingModel.references.find((entry) => entry.reference === referenceId) || null;
}

function findTierByHeight(tiers, heightCm) {
  return tiers.find((tier) => {
    if (tier.maxCm === null) {
      return heightCm > tier.minCm;
    }
    return heightCm >= tier.minCm && heightCm <= tier.maxCm;
  }) || null;
}

function findSqmTierFallback(tiers) {
  return (
    tiers.find((tier) => tier.unit === 'sq.m' && tier.minCm === 20 && tier.maxCm === 25) ||
    tiers.find((tier) => tier.unit === 'sq.m') ||
    null
  );
}

function getSelectedBaseVariant() {
  if (!activeReference) return null;

  if (activeReference.thicknessMode === 'variant') {
    const selectedId = thicknessSelect.value;
    return (
      activeReference.baseVariants.find((variant) => variant.id === selectedId) ||
      activeReference.baseVariants[0] ||
      null
    );
  }

  return activeReference.baseVariants[0] || null;
}

function computeTierAmount(tier, heightCm, areaM2, letterCount, hasText) {
  if (!tier) return 0;

  if (hasText && heightCm <= 20) {
    if (tier.unit === 'pcs') {
      return tier.price * letterCount;
    }
    if (tier.unit === 'cm') {
      return tier.price * heightCm * letterCount;
    }
  }

  if (tier.unit === 'sq.m') {
    return tier.price * areaM2;
  }

  if (tier.unit === 'cm') {
    return tier.price * heightCm;
  }

  if (tier.unit === 'pcs') {
    return tier.price;
  }

  return 0;
}

function roundToNearestStep(value, step) {
  return Math.round(value / step) * step;
}

function estimateExpressDelivery(orderSubtotal) {
  // Heuristic derived from 2025 factory invoice freight patterns:
  // - tiny orders can be as low as $135
  // - common express baseline clusters around $190
  // - larger orders trend upward gradually
  const tinyOrderThreshold = 150;
  const tinyOrderExpress = 135;
  const baselineSubtotal = 500;
  const baselineExpress = 190;
  const growthRate = 0.08;
  const maxExpress = 1280;

  if (orderSubtotal < tinyOrderThreshold) {
    return tinyOrderExpress;
  }

  const extraSubtotal = Math.max(0, orderSubtotal - baselineSubtotal);
  const raw = baselineExpress + (extraSubtotal * growthRate);
  return Math.min(maxExpress, roundToNearestStep(raw, 5));
}

function estimatePowerSupplies(orderSubtotal, areaM2) {
  // 2025 invoice pattern:
  // - XLG-75W-12V appears most often at ~$23-25
  // - XLG-150W-12V is commonly billed at $30
  // - XLG-200W-12V appears at $35 on larger loads
  let unitPrice = 23;

  if (areaM2 > 2.2 || orderSubtotal > 1800) {
    unitPrice = 35;
  } else if (areaM2 > 0.9 || orderSubtotal > 600) {
    unitPrice = 30;
  }

  const quantity = Math.max(1, Math.ceil(areaM2 / 2.2));
  return unitPrice * quantity;
}

function updateOutputs(
  base,
  thicknessSurcharge,
  colorSurcharge,
  finishCost,
  packingFee,
  powerSupplies,
  expressDelivery,
  total
) {
  baseCostEl.textContent = formatMoney(base);
  thicknessSurchargeEl.textContent = formatMoney(thicknessSurcharge);
  colorSurchargeEl.textContent = formatMoney(colorSurcharge);
  finishSurchargeEl.textContent = formatMoney(finishCost);
  packingFeeEl.textContent = formatMoney(packingFee);
  powerSuppliesEl.textContent = formatMoney(powerSupplies);
  expressDeliveryEl.textContent = formatMoney(expressDelivery);
  totalEl.textContent = formatMoney(total);
  roundedTotalEl.textContent = formatRounded(total);
}

function hydrateSelectorsForReference(referenceData) {
  const thicknessItems = [];

  if (referenceData.thicknessMode === 'variant') {
    referenceData.baseVariants.forEach((variant) => {
      thicknessItems.push({
        value: variant.id,
        label: variant.label,
      });
    });
  } else {
    referenceData.thicknessSurcharges.forEach((option) => {
      const suffix = option.thicknessMm ? `${option.thicknessMm} mm` : option.label;
      thicknessItems.push({
        value: option.id,
        label: `${suffix} (${pctLabel(option.pct)})`,
      });
    });
  }

  buildDropdown(thicknessSelect, thicknessItems);

  if (referenceData.thicknessMode === 'variant') {
    thicknessSelect.value = thicknessItems[0]?.value || '';
  } else {
    const preferred = referenceData.thicknessSurcharges.find((entry) => entry.thicknessMm === 30);
    thicknessSelect.value = preferred ? preferred.id : (thicknessItems[0]?.value || '');
  }

  const acrylicOptions = referenceData.finishes?.acrylicColorOptions || referenceData.colorSurcharges || [];
  const colorItems = acrylicOptions.map((entry) => ({
    value: entry.id,
    label: `${entry.label} (${pctLabel(entry.pct)})`,
  }));
  buildDropdown(colorSelect, colorItems);

  const defaultColor = acrylicOptions.find((entry) => entry.pct === 0);
  colorSelect.value = defaultColor ? defaultColor.id : (colorItems[0]?.value || '');

  const vinylOptions = referenceData.finishes?.vinylPrintOptions || [
    { id: 'none', label: 'None (0)', type: 'none' },
    ...(referenceData.finishOptions || []).map((option) => ({ ...option, type: 'tiered' })),
  ];
  const finishItems = vinylOptions.map((option) => ({
    value: option.id,
    label: option.label,
  }));
  buildDropdown(finishSelect, finishItems);
  finishSelect.value = 'none';
}

function recalc() {
  errorsEl.textContent = '';

  const textValue = textInput.value.trim();
  const widthMm = Number.parseFloat(widthInput.value);
  const heightMm = Number.parseFloat(heightInput.value);
  const letterCount = textValue.replace(/\s+/g, '').length;

  letterCountEl.textContent = `Letters: ${letterCount}`;

  if (!activeReference) {
    updateOutputs(0, 0, 0, 0, 0, 0, 0, 0);
    tierDisplayEl.textContent = 'Tier: —';
    return;
  }

  if (!Number.isFinite(widthMm) || widthMm <= 0 || !Number.isFinite(heightMm) || heightMm <= 0) {
    errorsEl.textContent =
      'Enter text de produce (leave empty if no text), product reference, width, height and choose options as needed';
    updateOutputs(0, 0, 0, 0, 0, 0, 0, 0);
    tierDisplayEl.textContent = 'Tier: —';
    return;
  }

  const widthCm = widthMm / 10;
  const heightCm = heightMm / 10;
  const hasText = letterCount > 0;
  const areaM2 = (widthCm * heightCm) / 10000;

  const baseVariant = getSelectedBaseVariant();
  if (!baseVariant) {
    errorsEl.textContent = 'No base pricing data for this reference.';
    updateOutputs(0, 0, 0, 0, 0, 0, 0, 0);
    tierDisplayEl.textContent = 'Tier: —';
    return;
  }

  const baseTier = (hasText || heightCm > 20)
    ? findTierByHeight(baseVariant.tiers, heightCm)
    : findSqmTierFallback(baseVariant.tiers);

  if (!baseTier) {
    errorsEl.textContent = 'Height is outside pricing tiers.';
    updateOutputs(0, 0, 0, 0, 0, 0, 0, 0);
    tierDisplayEl.textContent = 'Tier: —';
    return;
  }

  const base = computeTierAmount(baseTier, heightCm, areaM2, letterCount, hasText);

  let thicknessPct = 0;
  if (activeReference.thicknessMode === 'surcharge') {
    const selectedThickness = activeReference.thicknessSurcharges.find(
      (entry) => entry.id === thicknessSelect.value
    );
    thicknessPct = selectedThickness ? selectedThickness.pct : 0;
  }

  const acrylicOptions = activeReference.finishes?.acrylicColorOptions || activeReference.colorSurcharges || [];
  const selectedColor = acrylicOptions.find(
    (entry) => entry.id === colorSelect.value
  );
  const colorPct = selectedColor ? selectedColor.pct : 0;

  const thicknessSurcharge = base * thicknessPct;
  const colorSurcharge = base * colorPct;

  let finishCost = 0;
  if (finishSelect.value !== 'none') {
    const vinylOptions = activeReference.finishes?.vinylPrintOptions || activeReference.finishOptions || [];
    const finish = vinylOptions.find((entry) => entry.id === finishSelect.value);
    if (finish) {
      const finishTier = (hasText || heightCm > 20)
        ? findTierByHeight(finish.tiers, heightCm)
        : findSqmTierFallback(finish.tiers);
      finishCost = computeTierAmount(finishTier, heightCm, areaM2, letterCount, hasText);
    }
  }

  const carton = activeReference.packing.carton;
  const packingFee = Math.max(areaM2 * carton.price, carton.minimum);
  const subtotalBeforePower = base + thicknessSurcharge + colorSurcharge + finishCost + packingFee;
  const powerSupplies = estimatePowerSupplies(subtotalBeforePower, areaM2);
  const orderSubtotal = subtotalBeforePower + powerSupplies;
  const expressDelivery = deliveryModeSelect.value === 'express'
    ? estimateExpressDelivery(orderSubtotal)
    : 0;

  const total = orderSubtotal + expressDelivery;

  updateOutputs(
    base,
    thicknessSurcharge,
    colorSurcharge,
    finishCost,
    packingFee,
    powerSupplies,
    expressDelivery,
    total
  );
  tierDisplayEl.textContent = `Tier: ${baseTier.label}`;
}

function onReferenceChange() {
  activeReference = findReference(referenceSelect.value);
  if (!activeReference) {
    return;
  }
  hydrateSelectorsForReference(activeReference);
  recalc();
}

async function init() {
  const response = await fetch('data/pricing-models.json');
  pricingModel = await response.json();

  const referenceItems = pricingModel.references.map((entry) => ({
    value: entry.reference,
    label: entry.reference,
  }));
  buildDropdown(referenceSelect, referenceItems);

  referenceSelect.value = referenceItems[0]?.value || '';
  onReferenceChange();
}

referenceSelect.addEventListener('change', onReferenceChange);
[textInput, widthInput, heightInput, thicknessSelect, colorSelect, finishSelect].forEach((el) => {
  el.addEventListener('input', recalc);
  el.addEventListener('change', recalc);
});
deliveryModeSelect.addEventListener('change', recalc);

init();
