# SR drop diagnosis dashboard

Interactive merchant Success Rate (SR) diagnosis & corrective-action prototype.

## How to run

```bash
python3 -m http.server 8080
```

- Hub: http://localhost:8080/home.html
- Merchant SR: http://localhost:8080/sr/index.html
- Ops/PM metrics: http://localhost:8080/sr/ops-metrics.html
- Ops onboarding: http://localhost:8080/index.html

## Locked product decisions

1. **SR** = successful auths / total payment attempts; **3DS timeouts = TD**
2. **Audience** = merchant-facing; prototype has a merchant picker for 4 brands
3. **Threshold default** = monthly daily avg; **brand-new (&lt;6 mo)** → PG cohort benchmark
4. **Wrong diagnosis** → Request review → PG support (not in-dashboard dispute)
5. **Methods** = UPI, Cards, Netbanking, EMI, Wallets
6. **Leading / lagging** = separate Ops & PM view only
7. **High TD action** = merchant can switch PG / acquirer / processor

## Merchant demo map

| ID | Brand | Demo focus |
|----|-------|------------|
| **MID-SR-01** | Loom & Thread (Apparel, UPI-heavy, new → cohort default) | UPI **IMPROVED** after acquirer switch (T+2) |
| **MID-SR-02** | Glow Ritual (Beauty, EMI-heavy, mature) | EMI **worsened after action** |
| **MID-SR-03** | Nest & Nook (Home décor, balanced) | **STABLE** festive + threshold modes |
| **MID-SR-04** | Clay & Co (Crockery) | UPI **Request review**; Netbanking **IMPROVED** |
