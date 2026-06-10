// Tax and benefit calculations based on Australian rules
export function calculateWeeklyTax(grossWeekly: number) {
  const annualGross = grossWeekly * 52;

  // Tax 2024-2025 Brackets (Stage 3 Cuts)
  let annualTax = 0;
  if (annualGross > 190000) {
    annualTax = 51638 + (annualGross - 190000) * 0.45;
  } else if (annualGross > 135000) {
    annualTax = 31288 + (annualGross - 135000) * 0.37;
  } else if (annualGross > 45000) {
    annualTax = 4288 + (annualGross - 45000) * 0.3;
  } else if (annualGross > 18200) {
    annualTax = (annualGross - 18200) * 0.16;
  }

  // Medicare Levy (2% above ~$26000 threshold simplified)
  let medicare = 0;
  if (annualGross > 26000) {
    medicare = annualGross * 0.02;
  }

  // HECS/HELP brackets 2023-2024 (approximate)
  let hecs = 0;
  if (annualGross > 151200) hecs = annualGross * 0.1;
  else if (annualGross > 141660) hecs = annualGross * 0.095;
  else if (annualGross > 132731) hecs = annualGross * 0.09;
  else if (annualGross > 124357) hecs = annualGross * 0.085;
  else if (annualGross > 116508) hecs = annualGross * 0.08;
  else if (annualGross > 109156) hecs = annualGross * 0.075;
  else if (annualGross > 102271) hecs = annualGross * 0.07;
  else if (annualGross > 95790) hecs = annualGross * 0.065;
  else if (annualGross > 89721) hecs = annualGross * 0.06;
  else if (annualGross > 84042) hecs = annualGross * 0.055;
  else if (annualGross > 78726) hecs = annualGross * 0.05;
  else if (annualGross > 73742) hecs = annualGross * 0.045;
  else if (annualGross > 69073) hecs = annualGross * 0.04;
  else if (annualGross > 64700) hecs = annualGross * 0.035;
  else if (annualGross > 60627) hecs = annualGross * 0.03;
  else if (annualGross > 56811) hecs = annualGross * 0.025;
  else if (annualGross > 53215) hecs = annualGross * 0.02;
  else if (annualGross > 51550) hecs = annualGross * 0.01;

  const weeklyTax = annualTax / 52;
  const weeklyMedicare = medicare / 52;
  const weeklyHecs = hecs / 52;

  return {
    weeklyTax,
    weeklyMedicare,
    weeklyHecs,
    totalDeductions: weeklyTax + weeklyMedicare + weeklyHecs,
    netWeekly: grossWeekly - (weeklyTax + weeklyMedicare + weeklyHecs),
  };
}

export function calculateCentrelink(taxableWeeklyIncome: number) {
  // Centrelink Income reduction formula (Fortnightly test):
  // First $150: No reduction
  // Between $150 and $256: 50 cents for every dollar over 150
  // Over $256: 60 cents for every dollar over 256 (plus the $53 from the previous bracket)

  const fortnightlyEarned = taxableWeeklyIncome * 2;
  const maxFortnightlyPayment = 817.5; // User specified maximum

  let reduction = 0;

  if (fortnightlyEarned > 256) {
    const bracket1Reduction = (256 - 150) * 0.5; // $53
    const bracket2Reduction = (fortnightlyEarned - 256) * 0.6;
    reduction = bracket1Reduction + bracket2Reduction;
  } else if (fortnightlyEarned > 150) {
    reduction = (fortnightlyEarned - 150) * 0.5;
  }

  const fortnightlyPayment = Math.max(0, maxFortnightlyPayment - reduction);

  return {
    fortnightlyPayment,
    weeklyPayment: fortnightlyPayment / 2,
  };
}

export function calculateSuper(grossWeekly: number) {
  // Super Guarantee 12%
  return grossWeekly * 0.12;
}
