> Generated file: do not edit — run tools/render_campaign.py status --md

# Render campaign status

Items: `render-campaign.items.json`, events: `render-campaign-events.csv`. Last event: 2026-10-04T04:10:16Z.

| lane | done | claimed | open | waiting | blocked | stuck | total |
|---|---|---|---|---|---|---|---|
| standard | 65 | 0 | 12 | 0 | 5 | 0 | 82 |
| hero | 27 | 0 | 5 | 0 | 3 | 0 | 35 |

Below-gate (user spot-check): none

## Standard lane

| # | id | type | status | stage | claim | flags | title |
|---|---|---|---|---|---|---|---|
| 1 | `estate:final` | estate | done | - |  |  | Re-render the estate exterior views (failed job) |
| 2 | `estate:opt` | estate | done | - |  |  | Evaluate the rescued house_opt LOD glbs for the estate model manifest |
| 3 | `review:arms_rnd` | review | done | - |  |  | Review and fix model arms rnd |
| 4 | `review:clearing_depot` | review | done | - |  |  | Review and fix model clearing depot |
| 5 | `review:contest_corridor` | review | done | - |  |  | Review and fix model contest corridor |
| 6 | `review:ether_dome` | review | done | - |  |  | Review and fix model ether dome |
| 7 | `review:free_knight_camp` | review | done | - |  |  | Review and fix model free knight camp |
| 8 | `review:glory_crown` | review | done | - |  |  | Review and fix model glory crown |
| 9 | `review:linguang_post` | review | done | - |  |  | Review and fix model linguang post |
| 10 | `review:rust_outskirts` | review | done | - |  |  | Review and fix model rust outskirts |
| 11 | `review:league_club` | review | done | - |  |  | Review and fix model league club |
| 12 | `review:rothschild_estate` | review | done | - |  |  | Review and fix model rothschild estate |
| 13 | `review:elite_academy` | review | done | - |  |  | Review and fix model elite academy |
| 14 | `review:holy_mountain` | review | done | - |  |  | Review and fix model holy mountain |
| 15 | `lm:blood_mill` | landmark | done | - |  |  | New model: blood mill |
| 16 | `lm:freight_yard` | landmark | done | - |  |  | New model: freight yard |
| 17 | `lm:lower_bar` | landmark | done | - |  |  | New model: lower bar |
| 18 | `lm:slums` | landmark | done | - |  |  | New model: slums |
| 19 | `lm:rebirth_workshop` | landmark | done | - |  |  | New model: rebirth workshop |
| 20 | `lm:schneider_clinic` | landmark | done | - |  |  | New model: schneider clinic |
| 21 | `lm:elite_club` | landmark | done | - |  |  | New model: elite club |
| 22 | `lm:hunting_camp` | landmark | done | - |  |  | New model: hunting camp |
| 23 | `scene:highland-ext` | scene | done | - |  |  | Extend the highland scene: cliff edge and trail down |
| 24 | `scene:fief1` | scene | done | - |  |  | Fief 1 scene: castle, fields, order, village |
| 25 | `scene:fief2` | scene | done | - |  |  | Fief 2 scene: castle, fields, order, village |
| 26 | `scene:fief3` | scene | done | - |  |  | Fief 3 scene: castle, fields, order, village |
| 27 | `scene:fief4` | scene | done | - |  |  | Fief 4 scene: castle, fields, order, village |
| 28 | `scene:fief5` | scene | done | - |  |  | Fief 5 scene: castle, fields, order, village, lists |
| 29 | `scene:yuanyu-city` | scene | done | - |  |  | Yuanyu city scene: gate, dome, plaza, spire quarters |
| 30 | `base:tc_mid` | basemap | done | - |  |  | Final-spec audit / re-render of base map tc_mid |
| 31 | `base:tc_low` | basemap | done | - |  |  | Final-spec audit / re-render of base map tc_low |
| 32 | `base:site_kavalierki` | basemap | done | - |  |  | Final-spec audit / re-render of base map site_kavalierki |
| 33 | `base:yuanyu_sanctum` | basemap | done | - |  |  | Final-spec audit / re-render of base map yuanyu_sanctum |
| 34 | `base:yuanyu_city` | basemap | done | - |  |  | Final-spec audit / re-render of base map yuanyu_city |
| 35 | `base:site_highland` | basemap | done | - |  |  | Final-spec audit / re-render of base map site_highland |
| 36 | `base:site_fief1` | basemap | done | - |  |  | Final-spec audit / re-render of base map site_fief1 |
| 37 | `base:site_fief2` | basemap | done | - |  |  | Final-spec audit / re-render of base map site_fief2 |
| 38 | `base:site_fief3` | basemap | done | - |  |  | Final-spec audit / re-render of base map site_fief3 |
| 39 | `base:site_fief4` | basemap | done | - |  |  | Final-spec audit / re-render of base map site_fief4 |
| 40 | `base:site_fief5` | basemap | done | - |  |  | Final-spec audit / re-render of base map site_fief5 |
| 41 | `var:tc_mid:dawn` | variant | done | - |  |  | Period variant tc_mid / dawn |
| 42 | `var:tc_mid:dusk` | variant | done | - |  |  | Period variant tc_mid / dusk |
| 43 | `var:tc_mid:day` | variant | done | - |  |  | Period variant tc_mid / day |
| 44 | `var:tc_mid:night` | variant | done | - |  |  | Period variant tc_mid / night |
| 45 | `var:tc_low:dawn` | variant | done | - |  |  | Period variant tc_low / dawn |
| 46 | `var:tc_low:day` | variant | done | - |  |  | Period variant tc_low / day |
| 47 | `var:tc_low:dusk` | variant | done | - |  |  | Period variant tc_low / dusk |
| 48 | `var:tc_low:night` | variant | done | - |  |  | Period variant tc_low / night |
| 49 | `var:tc_upper_city:dawn` | variant | done | - |  |  | Upper map, city-below view, dawn period |
| 50 | `var:tc_upper_city:day` | variant | done | - |  |  | Upper map, city-below view, day period |
| 51 | `var:tc_upper_city:dusk` | variant | done | - |  |  | Upper map, city-below view, dusk period |
| 52 | `var:tc_upper_city:night` | variant | done | - |  |  | Upper map, city-below view, night period |
| 53 | `fix:climate_tower` | review | done | - |  |  | Climate tower material: white block on the top, pink strip on the podium |
| 54 | `inst:supreme_court` | review | done | - |  |  | Institution model check: supreme court |
| 55 | `inst:tiancheng_univ` | review | done | - |  |  | Institution model check: tiancheng univ |
| 56 | `obl:tc_mid:day` | basemap | done | - |  |  | Mid oblique base, day: canyon light, neon on (D41) |
| 57 | `obl:tc_mid:dusk` | variant | open | ship |  |  | Mid oblique, dusk (D41) |
| 58 | `obl:tc_mid:night` | variant | open | ship |  |  | Mid oblique, night (D41) |
| 59 | `obl:tc_low:dayshift` | basemap | done | - |  |  | Low oblique base, day shift: artificial light only (D41) |
| 60 | `obl:tc_low:nightshift` | variant | open | ship |  |  | Low oblique, night shift (D41) |
| 61 | `out:tc_mid:day` | variant | blocked | ship |  |  | Outskirts ring tc_mid / day, low-res (D41 scale) |
| 62 | `out:tc_mid:dusk` | variant | blocked | ship |  |  | Outskirts ring tc_mid / dusk, low-res (D41 scale) |
| 63 | `out:tc_mid:night` | variant | blocked | ship |  |  | Outskirts ring tc_mid / night, low-res (D41 scale) |
| 64 | `out:tc_low:dayshift` | variant | blocked | ship |  |  | Outskirts ring tc_low / dayshift, low-res (D41 scale) |
| 65 | `out:tc_low:nightshift` | variant | blocked | ship |  |  | Outskirts ring tc_low / nightshift, low-res (D41 scale) |
| 66 | `glb:budget:upper` | estate | done | - |  |  | Landmark models, upper group: budget re-export (D41 B3) |
| 67 | `glb:budget:mid` | estate | done | - |  |  | Landmark models, mid group: budget re-export (D41 B3) |
| 68 | `glb:budget:low` | estate | done | - |  |  | Landmark models, low group: budget re-export (D41 B3) |
| 69 | `glb:budget:sites` | estate | done | - |  |  | Landmark models, sites group: budget re-export (D41 B3) |
| 70 | `bake:night:upper` | estate | done | - |  |  | Landmark models, upper group: night emissive bake (D41 B4) |
| 71 | `bake:night:mid` | estate | done | - |  |  | Landmark models, mid group: night emissive bake (D41 B4) |
| 72 | `bake:night:low` | estate | done | - |  |  | Landmark models, low group: night emissive bake (D41 B4) |
| 73 | `bake:night:sites` | estate | done | - |  |  | Landmark models, sites group: night emissive bake (D41 B4) |
| 74 | `site8k:site_kavalierki` | basemap | open | audit |  |  | Opening site map site_kavalierki at 8000 px (D41 B6) |
| 75 | `site8k:yuanyu_sanctum` | basemap | open | audit |  |  | Opening site map yuanyu_sanctum at 8000 px (D41 B6) |
| 76 | `site8k:yuanyu_city` | basemap | open | audit |  |  | Opening site map yuanyu_city at 8000 px (D41 B6) |
| 77 | `site8k:site_highland` | basemap | open | audit |  |  | Opening site map site_highland at 8000 px (D41 B6) |
| 78 | `site8k:site_fief1` | basemap | open | audit |  |  | Opening site map site_fief1 at 8000 px (D41 B6) |
| 79 | `site8k:site_fief2` | basemap | open | audit |  |  | Opening site map site_fief2 at 8000 px (D41 B6) |
| 80 | `site8k:site_fief3` | basemap | open | audit |  |  | Opening site map site_fief3 at 8000 px (D41 B6) |
| 81 | `site8k:site_fief4` | basemap | open | audit |  |  | Opening site map site_fief4 at 8000 px (D41 B6) |
| 82 | `site8k:site_fief5` | basemap | open | audit |  |  | Opening site map site_fief5 at 8000 px (D41 B6) |

## Hero lane

| # | id | type | status | stage | claim | flags | title |
|---|---|---|---|---|---|---|---|
| 1 | `layout:tc_upper` | layout | done | - |  |  | Upper map island layout: Eden at the centre (user picks one of three options) |
| 2 | `eden:r5` | island | done | - |  |  | Eden estate r5: continue the shipped estate2 r4e scene, close the requirement gaps (user-approved) |
| 3 | `isle:eden` | island | done | - |  |  | Eden Manor island (the user's own estate) - showpiece, user-approved |
| 4 | `isle:silver_crown` | island | done | - |  |  | Rebuild island silver_crown |
| 5 | `isle:isle4` | island | done | - |  |  | Rebuild island isle4 (victor_estate) |
| 6 | `isle:isle5` | island | done | - |  |  | Rebuild island isle5 (y_estate) |
| 7 | `isle:isle6` | island | done | - |  |  | Rebuild island isle6 (pm_residence) |
| 8 | `isle:isle9` | island | done | - |  |  | Rebuild island isle9 (league_club) |
| 9 | `isle:isle10` | island | done | - |  |  | Rebuild island isle10 (kelly_residence) |
| 10 | `isle:isle25` | island | done | - |  |  | Rebuild island isle25 (elite_academy) |
| 11 | `isle:isle30` | island | done | - |  |  | Rebuild island isle30 (zaibatsu_estate) |
| 12 | `base:tc_upper` | basemap | done | - |  |  | Upper base map final |
| 13 | `var:tc_upper:16k` | variant | done | - |  |  | Upper map 16k final |
| 14 | `var:tc_upper:dawn` | variant | done | - |  |  | Upper map dawn period |
| 15 | `var:tc_upper:day` | variant | done | - |  |  | Upper map day period |
| 16 | `var:tc_upper:dusk` | variant | done | - |  |  | Upper map dusk period |
| 17 | `var:tc_upper:night` | variant | done | - |  |  | Upper map night period |
| 18 | `estate:b1b2` | estate | done | - |  |  | Estate basement B1 / B2 interior refinement |
| 19 | `lm:round_table_hall` | landmark | done | - |  |  | New model: round table hall |
| 20 | `lm:sun_arena` | landmark | done | - |  |  | New model: sun arena |
| 21 | `lm:union_tower` | landmark | done | - |  |  | New model: union tower |
| 22 | `base:world` | basemap | done | - |  |  | Final-spec audit / re-render of base map world |
| 23 | `obl:tc_upper:day` | basemap | done | - |  |  | Upper oblique base, day: islands only with alpha (D41) |
| 24 | `obl:tc_upper:dawn` | variant | open | ship |  |  | Upper oblique, dawn period: islands only with alpha (D41) |
| 25 | `obl:tc_upper:dusk` | variant | open | ship |  |  | Upper oblique, dusk period: islands only with alpha (D41) |
| 26 | `obl:tc_upper:night` | variant | open | ship |  |  | Upper oblique, night period: islands only with alpha (D41) |
| 27 | `obl:tc_upper_eden:day` | variant | open | ship |  |  | Eden oblique hi-res inset, day period (D41 B6) |
| 28 | `obl:tc_upper_eden:dawn` | variant | blocked | ship |  |  | Eden oblique hi-res inset, dawn period (D41 B6) |
| 29 | `obl:tc_upper_eden:dusk` | variant | blocked | ship |  |  | Eden oblique hi-res inset, dusk period (D41 B6) |
| 30 | `obl:tc_upper_eden:night` | variant | blocked | ship |  |  | Eden oblique hi-res inset, night period (D41 B6) |
| 31 | `base:world_cities` | basemap | done | - |  |  | World map day re-render with city patches (D41 B7) |
| 32 | `var:world:borders` | variant | done | - |  |  | World map borders at full resolution, thin lines (D41 B7) |
| 33 | `var:world:night` | variant | open | ship |  |  | World map night variant with city lights (D41 B7) |
| 34 | `estate:cutaway` | estate | done | - |  |  | Estate floors view: real interior materials, AO bake, practical lamps (D41 B5) |
| 35 | `glb:estate:night-glow` | estate | done | - |  |  | Estate exterior glb: a separable window / glass material for the night glow (D38) |

