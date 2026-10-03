# SR drop diagnosis dashboard

Interactive merchant Success Rate (SR) diagnosis & corrective-action prototype.

## How to run

From the repo root:

```bash
python3 -m http.server 8080
```

Then open:

- Hub: http://localhost:8080/home.html
- SR dashboard: http://localhost:8080/sr/index.html
- Ops onboarding (unchanged MVP): http://localhost:8080/index.html

No build step. Chart.js loads from CDN.

## Merchant demo map

| ID | Brand | Demo focus |
|----|-------|------------|
| **MID-SR-01** | Loom & Thread (Apparel, UPI-heavy, new) | UPI **DROP→action→IMPROVED** (T+2). Leading metric: acted within 24h. |
| **MID-SR-02** | Glow Ritual (Beauty, EMI-heavy, mature) | EMI **DROP**; corrective action taken but **SR worsened** (edge case). Festive BD instrument. |
| **MID-SR-03** | Nest & Nook (Home décor, balanced) | Mostly **STABLE**; festive context; try **threshold calculation** control. |
| **MID-SR-04** | Clay & Co (Crockery) | UPI **wrong diagnosis → Request review**; Netbanking **IMPROVED** after prior action. |

### Suggested click path

1. Login as **MID-SR-01** → open **UPI** → see IMPROVED attributed to Oct 1 acquirer switch.
2. Switch to **MID-SR-02** → open **EMI** → worsened-after-action banner + DROP.
3. **MID-SR-03** → change Threshold calculation → watch STABLE reasons/thresholds move.
4. **MID-SR-04** → **UPI** → Request review; **Netbanking** → IMPROVED.
5. On any method without an active action (e.g. Nest Cards): Accept action → Reverse within 24h.

## Product assumptions

See PR description for the short assumptions list (SR denominator, 3DS→TD, multi-PG routing, prototype “today” = 2026-10-03, localStorage for actions).
