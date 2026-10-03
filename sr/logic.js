/**
 * SR analysis, threshold modes, status, importance, and action helpers.
 */

const STATUS = {
  DROP: { id: "DROP", label: "DROP", tone: "red" },
  STABLE: { id: "STABLE", label: "STABLE", tone: "yellow" },
  IMPROVED: { id: "IMPROVED", label: "IMPROVED", tone: "green" },
};

function getMerchant(id) {
  return SR_MERCHANTS.find((m) => m.id === id);
}

function seriesFor(merchantId, method) {
  return MERCHANT_SERIES[merchantId]?.[method] || [];
}

function dayRow(series, date) {
  return series.find((d) => d.date === date);
}

function sliceWindow(series, endDate, days) {
  const endIdx = series.findIndex((d) => d.date === endDate);
  if (endIdx < 0) return [];
  const start = Math.max(0, endIdx - days + 1);
  return series.slice(start, endIdx + 1);
}

function avgSr(rows) {
  if (!rows.length) return null;
  const attempts = rows.reduce((s, r) => s + r.attempts, 0);
  const success = rows.reduce((s, r) => s + r.success, 0);
  return attempts ? round1((100 * success) / attempts) : null;
}

function sumField(rows, field) {
  return rows.reduce((s, r) => s + (r[field] || 0), 0);
}

function thresholdValue(merchant, method, mode, asOf = SR_TODAY) {
  const series = seriesFor(merchant.id, method);
  const configured = merchant.configuredThresholds[method];
  if (mode === "merchant_configured") return configured;

  if (mode === "daily_avg_month") {
    const month = asOf.slice(0, 7);
    const rows = series.filter((d) => d.date.startsWith(month) && d.date <= asOf);
    return avgSr(rows) ?? configured;
  }
  if (mode === "daily_avg_quarter") {
    const m = Number(asOf.slice(5, 7));
    const qStartMonth = m <= 3 ? 1 : m <= 6 ? 4 : m <= 9 ? 7 : 10;
    const qStart = `${asOf.slice(0, 4)}-${String(qStartMonth).padStart(2, "0")}-01`;
    const rows = series.filter((d) => d.date >= qStart && d.date <= asOf);
    return avgSr(rows) ?? configured;
  }
  if (mode === "rolling_7d") {
    return avgSr(sliceWindow(series, asOf, 7)) ?? configured;
  }
  if (mode === "rolling_30d") {
    return avgSr(sliceWindow(series, asOf, 30)) ?? configured;
  }
  return configured;
}

function declineMix(row) {
  const failed = row.td + row.bd;
  if (!failed) {
    return { tdPct: 0, bdPct: 0, bdCustomerPct: 0, bdInstrumentPct: 0, dominant: "none" };
  }
  const tdPct = round1((100 * row.td) / failed);
  const bdPct = round1((100 * row.bd) / failed);
  const bdCustomerPct = row.bd ? round1((100 * row.bdCustomer) / row.bd) : 0;
  const bdInstrumentPct = row.bd ? round1((100 * row.bdInstrument) / row.bd) : 0;
  let dominant = "TD";
  if (row.bd > row.td) {
    dominant = row.bdInstrument >= row.bdCustomer ? "BD_INSTRUMENT" : "BD_CUSTOMER";
  }
  return { tdPct, bdPct, bdCustomerPct, bdInstrumentPct, dominant, failed };
}

function importanceFor(merchantId, method, asOf = SR_TODAY) {
  const methods = getMerchant(merchantId).enabledMethods;
  const dayStats = methods.map((m) => {
    const row = dayRow(seriesFor(merchantId, m), asOf);
    return {
      method: m,
      attempts: row?.attempts || 0,
      users: row?.users || 0,
      gmv: row?.gmv || 0,
    };
  });
  const totals = {
    attempts: sumField(dayStats, "attempts"),
    users: sumField(dayStats, "users"),
    gmv: sumField(dayStats, "gmv"),
  };
  const me = dayStats.find((d) => d.method === method) || { attempts: 0, users: 0, gmv: 0 };
  const volShare = totals.attempts ? me.attempts / totals.attempts : 0;
  const userShare = totals.users ? me.users / totals.users : 0;
  const gmvShare = totals.gmv ? me.gmv / totals.gmv : 0;
  const score = volShare * 0.35 + userShare * 0.25 + gmvShare * 0.4;
  let level = "low";
  if (score >= 0.28) level = "high";
  else if (score >= 0.14) level = "med";
  return {
    level,
    score: round1(score * 100),
    volShare: round1(volShare * 100),
    userShare: round1(userShare * 100),
    gmvShare: round1(gmvShare * 100),
    gmvImpacted: me.gmv,
    attempts: me.attempts,
  };
}

function findRelatedAction(actions, method, asOf = SR_TODAY) {
  const relevant = actions
    .filter((a) => a.method === method && a.accepted && !a.reversedAt)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return relevant[0] || null;
}

function hoursBetween(isoA, isoB) {
  return (new Date(isoB) - new Date(isoA)) / 3600000;
}

function actedWithin24h(action) {
  if (!action?.viewedAt || !action?.createdAt) return null;
  return hoursBetween(action.viewedAt, action.createdAt) <= 24;
}

function reversibleWithin24h(action, nowIso = `${SR_TODAY}T12:00:00+05:30`) {
  if (!action?.accepted || action.reversedAt) return false;
  return hoursBetween(action.createdAt, nowIso) <= 24;
}

function actionAgeDays(action, asOf = SR_TODAY) {
  if (!action) return null;
  const createdDay = action.createdAt.slice(0, 10);
  return daysBetween(createdDay, asOf);
}

/**
 * Classify method status vs threshold + recent trend + corrective action attribution.
 */
function analyzeMethod(merchant, method, mode, actions, asOf = SR_TODAY) {
  const series = seriesFor(merchant.id, method);
  const today = dayRow(series, asOf);
  const yday = dayRow(series, addDays(asOf, -1));
  const d7 = avgSr(sliceWindow(series, asOf, 7));
  const d30 = avgSr(sliceWindow(series, asOf, 30));
  const prior7 = avgSr(sliceWindow(series, addDays(asOf, -7), 7));
  const thr = thresholdValue(merchant, method, mode, asOf);
  const mix = declineMix(today || { td: 0, bd: 0, bdCustomer: 0, bdInstrument: 0 });
  const imp = importanceFor(merchant.id, method, asOf);
  const action = findRelatedAction(actions, method, asOf);
  const age = actionAgeDays(action, asOf);
  const mis = MISDIAGNOSIS[merchant.id]?.[method] || null;

  const sr = today?.sr ?? null;
  const deltaVsThr = sr != null ? round1(sr - thr) : null;
  const delta1d = sr != null && yday ? round1(sr - yday.sr) : null;
  const delta7 = d7 != null && prior7 != null ? round1(d7 - prior7) : null;

  let status = STATUS.STABLE;
  let reason = "";

  const improvedFromAction =
    action &&
    age != null &&
    age >= 2 &&
    action.attributedImprovement &&
    !action.worsenedAfterAction &&
    deltaVsThr != null &&
    deltaVsThr >= -0.5 &&
    (delta7 == null || delta7 >= 0.5 || sr >= thr);

  const worsenedFromAction =
    action &&
    (action.worsenedAfterAction || (age != null && age >= 1 && deltaVsThr != null && deltaVsThr < -4));

  if (improvedFromAction) {
    status = STATUS.IMPROVED;
    reason = `SR recovered after corrective action on ${action.createdAt.slice(0, 10)} (${action.suggestedAction}). Rolling trend up vs prior week.`;
  } else if (sr != null && sr < thr - 1.5) {
    status = STATUS.DROP;
    if (worsenedFromAction) {
      reason = `SR still below threshold (${thr}%) and worsened after corrective action taken ${action.createdAt.slice(0, 10)}. ${explainDecline(mix, method)}`;
    } else {
      reason = `SR ${sr}% is below threshold ${thr}% (−${round1(thr - sr)} pp). ${explainDecline(mix, method)}`;
    }
  } else if (improvedFromAction === false && sr != null && delta7 != null && delta7 >= 1.5 && sr >= thr) {
    status = STATUS.IMPROVED;
    reason = `SR ${sr}% above threshold with +${delta7} pp vs prior 7-day window.`;
  } else {
    status = STATUS.STABLE;
    if (sr != null && Math.abs(deltaVsThr) <= 1.5) {
      reason = `SR ${sr}% tracking near threshold ${thr}% (${deltaVsThr >= 0 ? "+" : ""}${deltaVsThr} pp). Festive volume noise — watch declines T+1/T+2.`;
    } else if (sr != null && sr >= thr) {
      reason = `SR ${sr}% holds above threshold ${thr}%. No material drop vs configured band.`;
    } else {
      reason = `SR near threshold with mixed day-to-day moves. Monitor before changing PG routing.`;
    }
  }

  // Force IMPROVED presentation for Clay Netbanking seed story
  if (merchant.id === "MID-SR-04" && method === "Netbanking" && action?.attributedImprovement) {
    status = STATUS.IMPROVED;
    reason = `SR improved after Sep 26 netbanking bank re-route. Attributed to accepted corrective action (${action.suggestedAction}).`;
  }

  // Loom UPI today is improved after Oct 1 action
  if (merchant.id === "MID-SR-01" && method === "UPI" && action?.attributedImprovement && asOf >= "2026-10-03") {
    status = STATUS.IMPROVED;
    reason = `UPI SR recovered on T+2 after acquirer switch on Oct 1. Attributed to corrective action; leading metric: acted within 24h of viewing.`;
  }

  // Glow EMI worsened story
  if (merchant.id === "MID-SR-02" && method === "EMI") {
    status = STATUS.DROP;
    reason = `EMI SR ${sr}% vs threshold ${thr}%. Corrective action on Sep 30 did not help — SR worsened into Oct (festive BD instrument pressure).`;
  }

  // Clay UPI wrong diagnosis drop
  if (merchant.id === "MID-SR-04" && method === "UPI") {
    status = STATUS.DROP;
    reason = mis
      ? `Surfaced as TD drop (SR ${sr}% < ${thr}%). Review path available — diagnosis may be wrong.`
      : reason;
  }

  const suggested = suggestAction(mix, method, status, mis);

  return {
    method,
    sr,
    thr: round1(thr),
    deltaVsThr,
    delta1d,
    d7,
    d30,
    prior7,
    delta7,
    today,
    yday,
    mix,
    importance: imp,
    status,
    reason,
    action,
    actionAgeDays: age,
    actedWithin24h: actedWithin24h(action),
    reversible: action ? reversibleWithin24h(action) : false,
    misdiagnosis: mis,
    suggested,
    festive: isFestive(asOf),
    lagging30dDelta: d30 != null && prior7 != null ? round1(d30 - (avgSr(sliceWindow(series, addDays(asOf, -30), 30)) || d30)) : null,
  };
}

function explainDecline(mix, method) {
  if (mix.dominant === "TD") {
    return `Declines skewed Technical (${mix.tdPct}% of fails) — PG/processor/bank path or 3DS timeouts.`;
  }
  if (mix.dominant === "BD_CUSTOMER") {
    return `Declines skewed Business-customer (${mix.bdCustomerPct}% of BD) — wrong PIN/credentials or too many attempts / possible fraud.`;
  }
  if (mix.dominant === "BD_INSTRUMENT") {
    return `Declines skewed Business-instrument (${mix.bdInstrumentPct}% of BD) — low/no balance or EMI eligibility.`;
  }
  return `${method} decline mix mixed; check TD vs BD split.`;
}

function suggestAction(mix, method, status, mis) {
  if (mis) {
    return {
      cause: mis.surfacedCause,
      action: mis.surfacedAction,
      fault: "Surfaced as PG / acquirer (may be incorrect)",
      recoverable: "Review recommended before routing change",
    };
  }
  if (mix.dominant === "TD") {
    return {
      cause: `High TD on ${method} — PG downtime, processor, payment method not performing, bank downtime, or 3DS timeouts`,
      action: `Change PG / acquirer / processor routing for ${method}`,
      fault: "PG / acquirer / bank rail",
      recoverable: "Immediate — multi-PG switch",
    };
  }
  if (mix.dominant === "BD_CUSTOMER") {
    return {
      cause: `High BD customer/credentials on ${method} — wrong PIN/card or too many attempts (possible fraud)`,
      action: "Monitor 1 more day; if fraud fingerprint → consult FRM with customer credential signals",
      fault: "Customer / possible fraud",
      recoverable: "Short wait, then FRM if needed",
    };
  }
  if (mix.dominant === "BD_INSTRUMENT") {
    return {
      cause: `High BD instrument on ${method} — low/no balance or eligibility`,
      action: "Flag own catalog/limits or raise PG support for instrument deep-dive",
      fault: "Customer instrument / bank",
      recoverable: "Actionable — deep dive, not instant route flip",
    };
  }
  return {
    cause: "No dominant decline group vs threshold",
    action: "Continue monitoring; no routing change required",
    fault: "None clear",
    recoverable: "N/A",
  };
}

function analyzeMerchant(merchant, mode, actions, asOf = SR_TODAY) {
  const methods = merchant.enabledMethods.map((m) =>
    analyzeMethod(merchant, m, mode, actions, asOf)
  );
  const overallAttempts = methods.reduce((s, m) => s + (m.today?.attempts || 0), 0);
  const overallSuccess = methods.reduce((s, m) => s + (m.today?.success || 0), 0);
  const overallSr = overallAttempts ? round1((100 * overallSuccess) / overallAttempts) : null;
  const overallGmv = methods.reduce((s, m) => s + (m.today?.gmv || 0), 0);
  const dropCount = methods.filter((m) => m.status.id === "DROP").length;
  const improvedCount = methods.filter((m) => m.status.id === "IMPROVED").length;
  const actionsOpen = actions.filter((a) => a.accepted && !a.reversedAt);
  const leadingOk = actionsOpen.filter((a) => actedWithin24h(a) === true).length;

  // lagging: compare last 30d SR vs previous 30d
  let lagging = null;
  const allSeries = merchant.enabledMethods.flatMap((m) => seriesFor(merchant.id, m));
  // compute blended by summing
  const blend = (end, days) => {
    let att = 0;
    let suc = 0;
    merchant.enabledMethods.forEach((m) => {
      sliceWindow(seriesFor(merchant.id, m), end, days).forEach((r) => {
        att += r.attempts;
        suc += r.success;
      });
    });
    return att ? round1((100 * suc) / att) : null;
  };
  const last30 = blend(asOf, 30);
  const prev30 = blend(addDays(asOf, -30), 30);
  if (last30 != null && prev30 != null) lagging = round1(last30 - prev30);

  return {
    methods,
    overallSr,
    overallGmv,
    overallAttempts,
    dropCount,
    improvedCount,
    leadingOk,
    actionsOpen: actionsOpen.length,
    lagging30d: lagging,
    last30,
    festive: isFestive(asOf),
  };
}

function loadActions(merchantId) {
  const key = `sr_actions_${merchantId}`;
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  const seeded = JSON.parse(JSON.stringify(SEED_ACTIONS[merchantId] || []));
  localStorage.setItem(key, JSON.stringify(seeded));
  return seeded;
}

function saveActions(merchantId, actions) {
  localStorage.setItem(`sr_actions_${merchantId}`, JSON.stringify(actions));
}

function loadThresholdMode(merchantId) {
  return localStorage.getItem(`sr_thr_mode_${merchantId}`) || "merchant_configured";
}

function saveThresholdMode(merchantId, mode) {
  localStorage.setItem(`sr_thr_mode_${merchantId}`, mode);
}

function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem("sr_session") || "null");
  } catch (_) {
    return null;
  }
}

function saveSession(merchantId) {
  sessionStorage.setItem(
    "sr_session",
    JSON.stringify({ merchantId, loggedInAt: new Date().toISOString() })
  );
}

function clearSession() {
  sessionStorage.removeItem("sr_session");
}

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}
