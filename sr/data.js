/**
 * Seeded SR diagnosis merchants for India D2C PG prototype.
 * No real PII. "Today" anchored to 2026-10-03 (festive window Sept–Nov).
 */

const SR_TODAY = "2026-10-03";
const PAYMENT_METHODS = ["UPI", "Cards", "Netbanking", "EMI", "Wallets"];

const THRESHOLD_MODES = [
  { id: "merchant_configured", label: "Merchant-configured (default)" },
  { id: "daily_avg_month", label: "Daily avg — current month" },
  { id: "daily_avg_quarter", label: "Daily avg — current quarter" },
  { id: "rolling_7d", label: "Rolling 7-day average" },
  { id: "rolling_30d", label: "Rolling 30-day average" },
];

/** @type {Array<object>} */
const SR_MERCHANTS = [
  {
    id: "MID-SR-01",
    brand: "Loom & Thread",
    legalName: "Loom Thread Apparel Pvt Ltd",
    category: "Apparel",
    cities: "Mumbai, Bengaluru, Pune",
    maturityMonths: 4,
    maturityLabel: "New to online payments (<6 months)",
    festiveReady: false,
    am: "Ritika Shah",
    mixNote: "UPI-heavy (~62% of daily volume)",
    enabledMethods: ["UPI", "Cards", "Netbanking", "Wallets"],
    configuredThresholds: { UPI: 88, Cards: 82, Netbanking: 78, Wallets: 85 },
    demoStory:
      "UPI DROP from bank/NPCI TD → accept switch-acquirer action → SR improves ~2 days later (green, attributed).",
    demoTags: ["drop", "td-upi", "corrective-improve", "acted-24h"],
  },
  {
    id: "MID-SR-02",
    brand: "Glow Ritual",
    legalName: "Glow Ritual Beauty LLP",
    category: "Beauty",
    cities: "Delhi NCR, Hyderabad, Chandigarh",
    maturityMonths: 18,
    maturityLabel: "Mature (~1.5 years onboarded)",
    festiveReady: true,
    am: "Vikram Iyer",
    mixNote: "EMI-heavy (~38% GMV) with Cards second",
    enabledMethods: ["UPI", "Cards", "EMI", "Wallets"],
    configuredThresholds: { UPI: 90, Cards: 84, EMI: 72, Wallets: 86 },
    demoStory:
      "EMI DROP (BD instrument / low balance in festive) → merchant took corrective action → SR worsened (edge case).",
    demoTags: ["drop", "bd-emi", "worsened-after-action", "festive"],
  },
  {
    id: "MID-SR-03",
    brand: "Nest & Nook",
    legalName: "Nest Nook Home Décor Pvt Ltd",
    category: "Home décor",
    cities: "Jaipur, Ahmedabad, Indore",
    maturityMonths: 11,
    maturityLabel: "Mid maturity (~1 year)",
    festiveReady: true,
    am: "Mehul Desai",
    mixNote: "Balanced mix; Cards + UPI drive festive GMV",
    enabledMethods: ["UPI", "Cards", "Netbanking", "EMI", "Wallets"],
    configuredThresholds: { UPI: 89, Cards: 83, Netbanking: 80, EMI: 74, Wallets: 84 },
    demoStory:
      "Mostly STABLE (yellow) through festive ramp — tune thresholds; mild Cards TD watch.",
    demoTags: ["stable", "festive", "threshold-config", "balanced-mix"],
  },
  {
    id: "MID-SR-04",
    brand: "Clay & Co",
    legalName: "Clay Co Crockery Pvt Ltd",
    category: "Crockery",
    cities: "Chennai, Coimbatore, Kochi",
    maturityMonths: 8,
    maturityLabel: "Growing (~8 months onboarded)",
    festiveReady: false,
    am: "Priya Nair",
    mixNote: "UPI + Wallets heavy; Netbanking improving after prior action",
    enabledMethods: ["UPI", "Cards", "Netbanking", "Wallets"],
    configuredThresholds: { UPI: 87, Cards: 81, Netbanking: 76, Wallets: 83 },
    demoStory:
      "Wrong diagnosis on UPI (flagged TD, actually BD fraud pattern) → Request review. Netbanking IMPROVED after prior action.",
    demoTags: ["request-review", "wrong-diagnosis", "improved", "bd-fraud"],
  },
];

/**
 * Deterministic PRNG for stable seed series.
 */
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseISO(d) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

function formatISO(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(iso, n) {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return formatISO(d);
}

function daysBetween(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * Build daily attempt breakdown for one method.
 * Denominator = success + failed(BD+TD) + abandoned + pending.
 */
function buildDaySeries(seed, opts) {
  const rand = mulberry32(seed);
  const start = addDays(SR_TODAY, -(opts.days - 1));
  const series = [];

  for (let i = 0; i < opts.days; i++) {
    const date = addDays(start, i);
    const festiveBoost = festiveFactor(date);
    const baseVol = Math.round(opts.baseVol * (0.85 + rand() * 0.3) * festiveBoost);
    const srTarget = opts.srFn(date, i, rand);
    const success = Math.round(baseVol * (srTarget / 100));
    const remaining = Math.max(0, baseVol - success);

    const tdShare = clamp(opts.tdShareFn(date, i, rand), 0.05, 0.85);
    const failed = Math.round(remaining * (0.55 + rand() * 0.25));
    const td = Math.round(failed * tdShare);
    const bd = Math.max(0, failed - td);
    const bdCustomer = Math.round(bd * (opts.bdCustomerShare ?? 0.55));
    const bdInstrument = Math.max(0, bd - bdCustomer);
    const abandoned = Math.round(remaining * (0.25 + rand() * 0.15));
    const pending = Math.max(0, remaining - failed - abandoned);
    const attempts = success + td + bd + abandoned + pending;
    const sr = attempts ? round1((100 * success) / attempts) : 0;
    const gmv = Math.round(success * opts.aov * (0.9 + rand() * 0.2));

    series.push({
      date,
      attempts,
      success,
      td,
      bd,
      bdCustomer,
      bdInstrument,
      abandoned,
      pending,
      sr,
      gmv,
      users: Math.round(attempts * (0.72 + rand() * 0.18)),
    });
  }
  return series;
}

function festiveFactor(dateIso) {
  const d = parseISO(dateIso);
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  // Sept–Nov festive pressure; early Oct peak (Navratri / pre-Diwali ramp)
  if (m === 9) return 1.08 + day / 200;
  if (m === 10) return 1.18 + (day < 20 ? 0.12 : 0.05);
  if (m === 11) return 1.15;
  return 1;
}

function isFestive(dateIso) {
  const m = parseISO(dateIso).getUTCMonth() + 1;
  return m >= 9 && m <= 11;
}

/** Pre-built series + seeded actions per merchant */
const MERCHANT_SERIES = {};

function baselineSr(base, date, rand, wobble = 1.2) {
  const fest = isFestive(date) ? -0.6 : 0;
  return clamp(base + (rand() - 0.5) * wobble * 2 + fest, 55, 98);
}

function initSeries() {
  // MID-SR-01 Loom & Thread — UPI drop then recovery after action on Oct 1
  MERCHANT_SERIES["MID-SR-01"] = {
    UPI: buildDaySeries(101, {
      days: 45,
      baseVol: 4200,
      aov: 890,
      tdShareFn: (date) => {
        // Elevated TD Oct 1–2 (bank downtime), then recovery after switch
        if (date >= "2026-10-01" && date <= "2026-10-02") return 0.72;
        if (date >= "2026-09-28" && date < "2026-10-01") return 0.48;
        if (date >= "2026-10-03") return 0.22;
        return 0.28;
      },
      srFn: (date, i, rand) => {
        if (date >= "2026-09-28" && date <= "2026-10-02") return clamp(79 + (rand() - 0.5) * 2, 76, 82);
        if (date >= "2026-10-03") return clamp(91.5 + (rand() - 0.5), 90, 93); // improved after action
        return baselineSr(90, date, rand);
      },
      bdCustomerShare: 0.4,
    }),
    Cards: buildDaySeries(102, {
      days: 45,
      baseVol: 1100,
      aov: 1450,
      tdShareFn: () => 0.35,
      srFn: (date, i, rand) => baselineSr(84, date, rand),
    }),
    Netbanking: buildDaySeries(103, {
      days: 45,
      baseVol: 480,
      aov: 1680,
      tdShareFn: () => 0.4,
      srFn: (date, i, rand) => baselineSr(81.5, date, rand, 0.8),
    }),
    Wallets: buildDaySeries(104, {
      days: 45,
      baseVol: 620,
      aov: 720,
      tdShareFn: () => 0.3,
      srFn: (date, i, rand) => baselineSr(87, date, rand),
    }),
  };

  // MID-SR-02 Glow Ritual — EMI drop, action taken Sep 30, SR worsened into Oct
  MERCHANT_SERIES["MID-SR-02"] = {
    UPI: buildDaySeries(201, {
      days: 45,
      baseVol: 2100,
      aov: 1100,
      tdShareFn: () => 0.3,
      srFn: (date, i, rand) => baselineSr(91, date, rand),
    }),
    Cards: buildDaySeries(202, {
      days: 45,
      baseVol: 1600,
      aov: 2100,
      tdShareFn: () => 0.32,
      srFn: (date, i, rand) => baselineSr(85, date, rand),
    }),
    EMI: buildDaySeries(203, {
      days: 45,
      baseVol: 980,
      aov: 4200,
      tdShareFn: (date) => (date >= "2026-09-28" ? 0.22 : 0.28),
      bdCustomerShare: 0.25, // mostly instrument BD
      srFn: (date, i, rand) => {
        if (date < "2026-09-25") return baselineSr(76, date, rand);
        if (date >= "2026-09-25" && date < "2026-09-30") return clamp(68 + (rand() - 0.5) * 2, 65, 71);
        // After corrective action Sep 30 — worsened
        return clamp(62 + (rand() - 0.5) * 2.5, 58, 66);
      },
    }),
    Wallets: buildDaySeries(204, {
      days: 45,
      baseVol: 540,
      aov: 950,
      tdShareFn: () => 0.28,
      srFn: (date, i, rand) => baselineSr(88, date, rand),
    }),
  };

  // MID-SR-03 Nest & Nook — stable festive
  MERCHANT_SERIES["MID-SR-03"] = {
    UPI: buildDaySeries(301, {
      days: 45,
      baseVol: 2800,
      aov: 1600,
      tdShareFn: () => 0.3,
      srFn: (date, i, rand) => baselineSr(89.5, date, rand, 0.9),
    }),
    Cards: buildDaySeries(302, {
      days: 45,
      baseVol: 1900,
      aov: 2400,
      tdShareFn: (date) => (isFestive(date) ? 0.48 : 0.33),
      srFn: (date, i, rand) => {
        // Near threshold in festive — STABLE yellow watch, not a hard DROP
        const base = isFestive(date) ? 83.2 : 84.5;
        return baselineSr(base, date, rand, 0.6);
      },
    }),
    Netbanking: buildDaySeries(303, {
      days: 45,
      baseVol: 520,
      aov: 2800,
      tdShareFn: () => 0.36,
      srFn: (date, i, rand) => baselineSr(81, date, rand),
    }),
    EMI: buildDaySeries(304, {
      days: 45,
      baseVol: 640,
      aov: 5500,
      tdShareFn: () => 0.25,
      bdCustomerShare: 0.35,
      srFn: (date, i, rand) => baselineSr(74, date, rand, 1.4),
    }),
    Wallets: buildDaySeries(305, {
      days: 45,
      baseVol: 700,
      aov: 1200,
      tdShareFn: () => 0.3,
      srFn: (date, i, rand) => baselineSr(85, date, rand),
    }),
  };

  // MID-SR-04 Clay & Co — wrong UPI diagnosis + Netbanking improved after prior action
  MERCHANT_SERIES["MID-SR-04"] = {
    UPI: buildDaySeries(401, {
      days: 45,
      baseVol: 3100,
      aov: 780,
      // Surface looks like TD but actual BD fraud / credential stuffing
      tdShareFn: (date) => (date >= "2026-09-30" ? 0.55 : 0.3),
      bdCustomerShare: 0.75,
      srFn: (date, i, rand) => {
        if (date >= "2026-09-30") return clamp(80 + (rand() - 0.5) * 2, 78, 83);
        return baselineSr(89, date, rand);
      },
    }),
    Cards: buildDaySeries(402, {
      days: 45,
      baseVol: 900,
      aov: 1250,
      tdShareFn: () => 0.34,
      srFn: (date, i, rand) => baselineSr(82, date, rand),
    }),
    Netbanking: buildDaySeries(403, {
      days: 45,
      baseVol: 410,
      aov: 1500,
      tdShareFn: (date) => (date >= "2026-09-28" ? 0.2 : 0.45),
      srFn: (date, i, rand) => {
        // Prior action Sep 26 → improved from Oct 1
        if (date < "2026-09-26") return clamp(71 + (rand() - 0.5) * 2, 68, 74);
        if (date >= "2026-09-26" && date < "2026-10-01") return clamp(75 + (rand() - 0.5), 73, 77);
        return clamp(83 + (rand() - 0.5), 81, 85);
      },
    }),
    Wallets: buildDaySeries(404, {
      days: 45,
      baseVol: 1200,
      aov: 650,
      tdShareFn: () => 0.28,
      srFn: (date, i, rand) => baselineSr(86, date, rand),
    }),
  };
}

initSeries();

/**
 * Seeded corrective actions (pre-history). Runtime actions go to localStorage.
 */
const SEED_ACTIONS = {
  "MID-SR-01": [
    {
      id: "act-lt-upi-001",
      method: "UPI",
      accepted: true,
      cause: "High TD — multiple issuer banks / NPCI path latency during festive ramp",
      suggestedAction: "Switch UPI traffic to backup acquirer (HDFC → Yes Bank route)",
      diagnosis: "DROP",
      declineGroup: "TD",
      fault: "PG / acquirer path",
      createdAt: "2026-10-01T09:20:00+05:30",
      viewedAt: "2026-10-01T08:55:00+05:30",
      reversedAt: null,
      outcomeNote: "SR recovered on T+2 (Oct 3) after acquirer switch.",
      attributedImprovement: true,
    },
  ],
  "MID-SR-02": [
    {
      id: "act-gr-emi-001",
      method: "EMI",
      accepted: true,
      cause: "High BD instrument — EMI eligibility / low balance declines spiked with festive ticket sizes",
      suggestedAction: "Flag EMI plans for PG deep-dive; temporarily soften tenure offers on high-AOV SKUs",
      diagnosis: "DROP",
      declineGroup: "BD_INSTRUMENT",
      fault: "Customer instrument / bank eligibility",
      createdAt: "2026-09-30T14:10:00+05:30",
      viewedAt: "2026-09-30T13:40:00+05:30",
      reversedAt: null,
      outcomeNote: "SR worsened after action — tenure softener may have shifted more marginal EMI attempts.",
      attributedImprovement: false,
      worsenedAfterAction: true,
    },
  ],
  "MID-SR-03": [],
  "MID-SR-04": [
    {
      id: "act-cc-nb-001",
      method: "Netbanking",
      accepted: true,
      cause: "Elevated TD — primary netbanking bank downtime windows",
      suggestedAction: "Re-order netbanking bank list; route SBI/HDFC via secondary processor",
      diagnosis: "DROP",
      declineGroup: "TD",
      fault: "Bank / processor",
      createdAt: "2026-09-26T11:05:00+05:30",
      viewedAt: "2026-09-26T10:50:00+05:30",
      reversedAt: null,
      outcomeNote: "SR improved from Oct 1; attributed to bank re-route.",
      attributedImprovement: true,
    },
  ],
};

/** Intentional mis-diagnosis flag for demo (Clay & Co UPI) */
const MISDIAGNOSIS = {
  "MID-SR-04": {
    UPI: {
      surfacedCause: "High TD — UPI PSP / bank downtime pattern",
      surfacedAction: "Change UPI PG / acquirer routing",
      actualCause:
        "BD customer/credentials — credential stuffing & repeated wrong UPI PIN (possible fraud)",
      actualAction: "Consult FRM with customer credential attempt signals; monitor 24h",
      reviewHint: "Surfaced TD diagnosis does not match BD fraud fingerprint in auth logs.",
    },
  },
};
