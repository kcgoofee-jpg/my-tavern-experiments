> Generated file: do not edit — run tools/render_campaign.py status --md

# Render campaign status

Items: `render-campaign.items.json`, events: `render-campaign-events.csv`. Last event: 2026-09-30T14:27:02Z.

| lane | done | claimed | open | waiting | blocked | stuck | total |
|---|---|---|---|---|---|---|---|
| standard | 18 | 0 | 30 | 0 | 0 | 0 | 48 |
| hero | 3 | 0 | 11 | 1 | 6 | 0 | 21 |

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
| 19 | `lm:rebirth_workshop` | landmark | open | new |  |  | New model: rebirth workshop |
| 20 | `lm:schneider_clinic` | landmark | open | new |  |  | New model: schneider clinic |
| 21 | `lm:elite_club` | landmark | open | new |  |  | New model: elite club |
| 22 | `lm:hunting_camp` | landmark | open | new |  |  | New model: hunting camp |
| 23 | `scene:highland-ext` | scene | open | new |  |  | Extend the highland scene: cliff edge and trail down |
| 24 | `scene:fief1` | scene | open | new |  |  | Fief 1 scene: castle, fields, order, village |
| 25 | `scene:fief2` | scene | open | new |  |  | Fief 2 scene: castle, fields, order, village |
| 26 | `scene:fief3` | scene | open | new |  |  | Fief 3 scene: castle, fields, order, village |
| 27 | `scene:fief4` | scene | open | new |  |  | Fief 4 scene: castle, fields, order, village |
| 28 | `scene:fief5` | scene | open | new |  |  | Fief 5 scene: castle, fields, order, village, lists |
| 29 | `scene:yuanyu-city` | scene | open | new |  |  | Yuanyu city scene: gate, dome, plaza, spire quarters |
| 30 | `base:tc_mid` | basemap | open | audit |  |  | Final-spec audit / re-render of base map tc_mid |
| 31 | `base:tc_low` | basemap | open | audit |  |  | Final-spec audit / re-render of base map tc_low |
| 32 | `base:site_kavalierki` | basemap | open | audit |  |  | Final-spec audit / re-render of base map site_kavalierki |
| 33 | `base:yuanyu_sanctum` | basemap | open | audit |  |  | Final-spec audit / re-render of base map yuanyu_sanctum |
| 34 | `base:yuanyu_city` | basemap | open | audit |  |  | Final-spec audit / re-render of base map yuanyu_city |
| 35 | `base:site_highland` | basemap | open | audit |  |  | Final-spec audit / re-render of base map site_highland |
| 36 | `base:site_fief1` | basemap | open | audit |  |  | Final-spec audit / re-render of base map site_fief1 |
| 37 | `base:site_fief2` | basemap | open | audit |  |  | Final-spec audit / re-render of base map site_fief2 |
| 38 | `base:site_fief3` | basemap | open | audit |  |  | Final-spec audit / re-render of base map site_fief3 |
| 39 | `base:site_fief4` | basemap | open | audit |  |  | Final-spec audit / re-render of base map site_fief4 |
| 40 | `base:site_fief5` | basemap | open | audit |  |  | Final-spec audit / re-render of base map site_fief5 |
| 41 | `var:tc_mid:dawn` | variant | open | render |  |  | Period variant tc_mid / dawn |
| 42 | `var:tc_mid:dusk` | variant | open | render |  |  | Period variant tc_mid / dusk |
| 43 | `var:tc_mid:day` | variant | open | render |  |  | Period variant tc_mid / day |
| 44 | `var:tc_mid:night` | variant | open | render |  |  | Period variant tc_mid / night |
| 45 | `var:tc_low:dawn` | variant | open | render |  |  | Period variant tc_low / dawn |
| 46 | `var:tc_low:day` | variant | open | render |  |  | Period variant tc_low / day |
| 47 | `var:tc_low:dusk` | variant | open | render |  |  | Period variant tc_low / dusk |
| 48 | `var:tc_low:night` | variant | open | render |  |  | Period variant tc_low / night |

## Hero lane

| # | id | type | status | stage | claim | flags | title |
|---|---|---|---|---|---|---|---|
| 1 | `eden:r5` | island | waiting | user-review | hero-1 | waiting-on-user | Eden estate r5: continue the shipped estate2 r4e scene, close the requirement gaps (user-approved) |
| 2 | `isle:eden` | island | done | - |  |  | Eden Manor island (the user's own estate) - showpiece, user-approved |
| 3 | `isle:silver_crown` | island | done | - |  |  | Rebuild island silver_crown |
| 4 | `isle:isle4` | island | done | - |  |  | Rebuild island isle4 (victor_estate) |
| 5 | `isle:isle5` | island | open | fix |  |  | Rebuild island isle5 (y_estate) |
| 6 | `isle:isle6` | island | open | setting |  |  | Rebuild island isle6 (pm_residence) |
| 7 | `isle:isle9` | island | open | setting |  |  | Rebuild island isle9 (league_club) |
| 8 | `isle:isle10` | island | open | setting |  |  | Rebuild island isle10 (kelly_residence) |
| 9 | `isle:isle25` | island | open | setting |  |  | Rebuild island isle25 (elite_academy) |
| 10 | `isle:isle30` | island | open | setting |  |  | Rebuild island isle30 (zaibatsu_estate) |
| 11 | `base:tc_upper` | basemap | blocked | audit |  |  | Upper base map final |
| 12 | `var:tc_upper:16k` | variant | blocked | render |  |  | Upper map 16k final |
| 13 | `var:tc_upper:dawn` | variant | blocked | render |  |  | Upper map dawn period |
| 14 | `var:tc_upper:day` | variant | blocked | render |  |  | Upper map day period |
| 15 | `var:tc_upper:dusk` | variant | blocked | render |  |  | Upper map dusk period |
| 16 | `var:tc_upper:night` | variant | blocked | render |  |  | Upper map night period |
| 17 | `estate:b1b2` | estate | open | final |  |  | Estate basement B1 / B2 interior refinement |
| 18 | `lm:round_table_hall` | landmark | open | new |  |  | New model: round table hall |
| 19 | `lm:sun_arena` | landmark | open | new |  |  | New model: sun arena |
| 20 | `lm:union_tower` | landmark | open | new |  |  | New model: union tower |
| 21 | `base:world` | basemap | open | audit |  |  | Final-spec audit / re-render of base map world |

