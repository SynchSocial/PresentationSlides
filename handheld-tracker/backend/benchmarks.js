// benchmarks.js — real processor benchmarks, sourced.
//
// Numbers below are AnTuTu totals from nanoreview.net (a public SoC benchmark
// database), captured 2026-06; the score the catalog uses to place a chip on
// the emulation-tier scale. A few notes:
//   • Android-class SoCs (Snapdragon / Dimensity / Helio / Unisoc) have public
//     AnTuTu scores — those are the real measured values.
//   • Low-end embedded Linux SoCs (Allwinner / Rockchip / SigmaStar) don't run
//     AnTuTu meaningfully, so they get nominal anchors *below* the measured
//     range, ordered by real-world emulation performance (Retro Game Corps /
//     r/SBCGaming tier consensus). Marked `embedded` below.
//   • A couple of niche handheld SoCs have no public AnTuTu; marked `estimate`.
// To refresh: re-scrape nanoreview (see scrapeBenchmark) or update inline.

import { chipBenchmark as scrapeBenchmark } from "./firecrawl.js";
import { NEXT_GEN_SOCS } from "./watchlist.js";

export const CHIP_BENCHMARKS = {
  // embedded Linux SoCs — nominal anchors (no public AnTuTu)
  "Allwinner A33":            10000,   // embedded
  "SigmaStar SSD202D":        12000,   // embedded
  "Rockchip RK3326S":         45000,   // embedded
  "Allwinner H700":           90000,   // embedded
  "Allwinner A133P":          100000,  // embedded
  "Rockchip RK3566":          130000,  // embedded
  // Android-class SoCs — real AnTuTu (nanoreview.net, 2026-06)
  "Unisoc T618":              308208,
  "Snapdragon 662":           320666,
  "MediaTek Helio G99":       552286,
  "Unisoc T820":              757199,
  "MediaTek Dimensity 1100":  972810,
  "Dimensity 1100 / 8300":    972810,  // RP Flip 2 (lists both; rated on the 1100)
  "Snapdragon 865":           976177,
  "Snapdragon G2 Gen 2":      1400000, // estimate — no public AnTuTu
  "MediaTek Dimensity 8300":  1600704,
  "Snapdragon G3x Gen 2":     1690726, // AYANEO official (Pocket S)
  "Snapdragon 8 Gen 2":       1754213,
  "Snapdragon 8 Elite":       3119308, // Snapdragon 8 Elite (Gen 4)
};

// Representative benchmark for each emulation tier = its anchor chip's score.
// A brand-new chip's benchmark is mapped to the highest tier it meets.
export const PROFILE_BENCHMARK = {
  a33:      CHIP_BENCHMARKS["Allwinner A33"],
  ssd202:   CHIP_BENCHMARKS["SigmaStar SSD202D"],
  rk3326s:  CHIP_BENCHMARKS["Rockchip RK3326S"],
  h700:     CHIP_BENCHMARKS["Allwinner H700"],
  a133p:    CHIP_BENCHMARKS["Allwinner A133P"],
  rk3566:   CHIP_BENCHMARKS["Rockchip RK3566"],
  t618:     CHIP_BENCHMARKS["Unisoc T618"],
  g99:      CHIP_BENCHMARKS["MediaTek Helio G99"],
  t820:     CHIP_BENCHMARKS["Unisoc T820"],
  d1100:    CHIP_BENCHMARKS["MediaTek Dimensity 1100"],
  sd865:    CHIP_BENCHMARKS["Snapdragon 865"],
  g2gen2:   CHIP_BENCHMARKS["Snapdragon G2 Gen 2"],
  d8300:    CHIP_BENCHMARKS["MediaTek Dimensity 8300"],
  g3x:      CHIP_BENCHMARKS["Snapdragon G3x Gen 2"],
  sd8g2:    CHIP_BENCHMARKS["Snapdragon 8 Gen 2"],
  sd8elite: CHIP_BENCHMARKS["Snapdragon 8 Elite"],
};

// A chip at/above this is flagship-class ("known-good for everything").
export const FLAGSHIP_BENCHMARK = PROFILE_BENCHMARK.sd8g2; // ~1.75M (8 Gen 2)
export const isFlagship = (benchmark) => typeof benchmark === "number" && benchmark >= FLAGSHIP_BENCHMARK;

// Benchmark for a chip, best source first:
//   1. curated real value (CHIP_BENCHMARKS)
//   2. next-gen "known-good" watchlist value (so a flagship we already trust
//      lands top-tier even before public benchmark DBs list it — and isn't
//      mis-rated by a noisy scrape)
//   3. live scrape (nanoreview via Firecrawl; deterministic mock without a key)
// Returns a number or null.
export async function resolveBenchmark(chip) {
  if (CHIP_BENCHMARKS[chip] != null) return CHIP_BENCHMARKS[chip];
  if (NEXT_GEN_SOCS[chip] != null) return NEXT_GEN_SOCS[chip];
  return await scrapeBenchmark(chip);
}
