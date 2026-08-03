import type { ChannelRow, DailyRow, PageRow } from "./aggregate.ts"

/**
 * A real snapshot of the three bound data sources, taken 2026-08-03.
 *
 * Deliberately the actual rows rather than invented ones. This is a low-traffic
 * site — tens of sessions a day, nine days with zero engaged sessions, one
 * 78-session spike — and plausible-looking synthetic data would hide exactly
 * the conditions the layout has to survive. It also lets `test/aggregate.test.ts`
 * assert against figures that were measured, so a regression in the weighting
 * shows up as a failing number rather than a chart that still looks fine.
 *
 * The Site Daily block is copied verbatim, **including the duplicate rows** for
 * 2026-07-29 … 08-02 that `siteDailyDelta` creates on every run. `?mock` should
 * show the same "rows collapsed" note the bound block shows.
 *
 * It is a snapshot, so it goes stale. That's fine: nothing here feeds the bound
 * dashboard, and a stale fixture with correct arithmetic is more useful than a
 * fresh one with made-up numbers. Note that `test/aggregate.test.ts` asserts
 * against these exact figures, so refreshing the data means re-deriving them.
 *
 * To refresh, run these against the Notion data sources — each returns one row
 * holding the whole block in the format the parsers below expect. `Date` is not
 * queryable by name; SQL sees the expanded `date:Date:start` column.
 *
 *   -- daily (63e21b6e-04db-4af4-9f64-e3bbe9b793e4), newline-separated
 *   SELECT GROUP_CONCAT("date:Date:start" || ',' || CAST(Sessions AS INT) || ','
 *     || CAST("Engaged Sessions" AS INT) || ',' || "Avg Session Duration" || ','
 *     || CAST("Screen Page Views" AS INT) || ',' || CAST("Total Users" AS INT)
 *     || ',' || CAST("New Users" AS INT) || ',' || CAST("Active Users" AS INT)
 *     || ',' || CAST("Key Events" AS INT), ';') FROM "collection://…"
 *
 *   -- acquisition (dd99b9e0-17a4-4a02-bd9a-6573c4faa1f7), ';'-separated
 *   SELECT GROUP_CONCAT(substr("date:Date:start",6) || '|' || "Channel Group"
 *     || '|' || "Session Source" || '|' || "Session Medium" || '|'
 *     || CAST(Sessions AS INT) || '|' || CAST("Engaged Sessions" AS INT) || '|'
 *     || CAST("New Users" AS INT) || '|'
 *     || CAST("User Engagement Duration" AS INT), ';') FROM "collection://…"
 *
 *   -- pages (5e775afc-5dfb-44fa-b584-c46b9b24bcdc), ';'-separated
 *   SELECT GROUP_CONCAT(Page || '|' || COALESCE("Page Type",'') || '|'
 *     || CAST(Views AS INT) || '|' || CAST(Users AS INT) || '|'
 *     || CAST("Engagement (s)" AS INT) || '|' || CAST("Views (28d)" AS INT)
 *     || '|' || CAST("Users (28d)" AS INT) || '|'
 *     || CAST("Engagement (28d)" AS INT) || '|'
 *     || CASE WHEN Matched='__YES__' THEN 1 ELSE 0 END || '|'
 *     || COALESCE("Source Title",''), ';') FROM "collection://…"
 *
 * The daily block below is newline-separated because its first field is already
 * a full date; the other two use ';' so paths and titles can contain commas.
 */

// day,sessions,engagedSessions,avgSessionDuration,views,totalUsers,newUsers,activeUsers,keyEvents
const DAILY = `
2026-05-10,6,2,89.88,10,6,4,5,0
2026-04-20,18,5,41.18,24,15,12,15,0
2026-06-03,9,3,546.76,16,7,5,7,0
2026-06-19,33,9,103.32,52,31,29,30,0
2026-05-07,15,6,54.7,17,13,11,11,0
2026-04-30,19,7,326.74,71,18,13,17,0
2026-07-16,34,14,97.65,45,30,32,30,0
2026-05-26,37,14,153.64,46,31,28,30,0
2026-04-29,20,10,168.59,61,17,13,17,0
2026-06-01,13,5,18.98,16,12,9,11,0
2026-07-31,28,12,179.14,45,24,23,24,0
2026-04-18,13,3,128.33,23,13,12,13,0
2026-06-25,28,9,68.14,42,27,25,26,0
2026-05-06,37,7,93.21,48,31,22,26,0
2026-07-21,19,7,190.08,38,15,13,13,0
2026-05-27,20,5,8.58,20,18,15,18,0
2026-07-10,27,5,78.35,26,23,18,20,0
2026-05-30,4,0,0,4,4,3,3,0
2026-05-04,21,9,192.29,31,17,14,15,0
2026-06-16,15,11,147.69,25,15,13,15,0
2026-07-04,23,7,99.9,41,22,19,20,0
2026-07-18,19,2,16.15,17,17,15,16,0
2026-05-14,19,5,35.63,20,17,14,15,0
2026-07-19,7,1,6.16,8,7,6,6,0
2026-08-01,13,0,314.07,19,12,12,12,0
2026-06-05,13,4,63.29,19,12,11,11,0
2026-05-02,8,3,176.16,15,7,4,5,0
2026-07-15,23,8,35.44,31,23,23,23,0
2026-05-22,23,10,117.29,27,22,19,21,0
2026-05-20,28,10,63.87,42,27,25,26,0
2026-07-01,40,12,90.07,48,36,35,36,0
2026-04-13,19,8,115.16,36,17,16,17,0
2026-07-26,10,0,0.25,9,9,9,9,0
2026-08-01,13,0,314.07,19,12,12,12,0
2026-04-25,7,1,14.9,5,7,5,6,0
2026-05-25,18,6,41.77,22,17,14,15,0
2026-06-23,27,4,56.88,43,26,25,25,0
2026-06-14,11,2,5.22,13,10,8,9,0
2026-07-12,10,3,26.87,16,10,10,10,0
2026-04-12,16,1,4.47,16,15,15,15,0
2026-06-15,12,2,7.27,13,12,10,10,0
2026-04-17,19,7,120.65,36,17,16,17,0
2026-04-22,35,12,192.01,49,27,24,26,0
2026-05-11,9,6,22.51,12,9,8,9,0
2026-06-07,11,1,3.9,12,9,8,8,0
2026-06-24,21,4,8.84,23,21,20,20,0
2026-04-21,10,3,424.79,31,8,6,7,0
2026-04-23,18,3,50.18,16,14,10,11,0
2026-06-06,11,7,72.32,15,8,4,8,0
2026-04-27,22,10,909.94,118,19,15,18,0
2026-05-29,8,4,13.54,12,8,7,7,0
2026-06-20,9,0,0,9,9,9,9,0
2026-06-13,16,5,245.8,19,14,10,12,0
2026-06-08,12,3,13.91,12,11,10,10,0
2026-05-15,28,10,130.67,33,24,22,23,0
2026-05-08,16,5,144.39,16,14,9,11,0
2026-06-04,12,7,134.94,21,8,6,8,0
2026-06-22,21,9,220.05,36,20,16,18,0
2026-06-26,18,7,127.61,24,17,14,16,0
2026-05-19,23,12,133.91,37,19,17,18,0
2026-04-19,7,3,16.65,9,7,6,6,0
2026-07-28,15,4,11.72,19,15,13,15,0
2026-07-17,23,9,26.28,29,22,23,21,0
2026-04-26,7,0,0,7,7,7,7,0
2026-05-31,9,6,82.44,14,9,9,9,0
2026-06-28,14,2,18.72,18,13,12,13,0
2026-06-17,13,8,225.92,28,12,10,12,0
2026-07-06,34,9,115.77,37,27,21,24,0
2026-07-14,13,7,156.61,16,12,10,11,0
2026-05-18,3,1,32.95,3,3,2,2,0
2026-06-21,12,0,0.35,12,11,10,10,0
2026-04-16,14,4,92.26,28,12,10,12,0
2026-04-15,17,7,220.44,32,15,14,15,0
2026-07-24,19,9,62.15,29,16,15,15,0
2026-07-07,19,6,46.65,23,17,11,12,0
2026-05-13,13,5,59.77,17,12,9,10,0
2026-05-24,8,2,27.79,11,8,6,7,0
2026-05-28,18,4,135.8,22,13,10,12,0
2026-05-16,21,7,86.97,22,18,16,16,0
2026-06-29,19,10,248.16,32,18,15,18,0
2026-07-25,7,4,265.7,8,6,4,6,0
2026-05-21,18,5,73.54,24,12,10,11,0
2026-07-29,22,11,71.1,26,20,18,19,0
2026-05-23,8,5,210.12,26,7,7,7,0
2026-06-11,8,2,26.41,8,8,7,8,0
2026-06-30,78,24,23.09,139,78,88,76,0
2026-07-03,26,9,127.45,32,23,17,19,0
2026-04-14,12,7,412.37,30,10,7,8,0
2026-07-09,25,5,54.33,27,24,22,22,0
2026-05-05,27,16,431.7,77,21,15,19,0
2026-07-02,77,19,112.8,103,67,62,65,0
2026-05-03,11,3,27.55,14,11,7,9,0
2026-07-30,17,7,256.75,46,17,15,16,0
2026-06-10,12,5,54.83,17,12,12,12,0
2026-07-29,22,11,71.1,26,20,18,19,0
2026-07-08,28,12,139.92,33,23,18,21,0
2026-06-02,14,5,98.86,24,13,11,12,0
2026-06-27,12,2,7.6,14,10,10,10,0
2026-07-27,10,3,153.35,11,10,8,10,0
2026-07-20,15,4,69.13,18,14,13,14,0
2026-05-12,10,3,20.31,10,9,9,9,0
2026-05-01,19,14,812.81,77,16,12,16,0
2026-04-28,23,13,331.74,39,16,8,13,0
2026-05-09,18,0,1.02,18,18,18,18,0
2026-07-11,20,2,2.59,20,20,19,19,0
2026-07-13,20,9,436.08,49,17,14,16,0
2026-06-18,23,9,199.81,35,20,13,17,0
2026-06-12,9,2,5.57,10,9,7,8,0
2026-07-30,17,7,256.75,46,17,15,16,0
2026-07-23,12,4,217.3,17,11,11,11,0
2026-06-09,14,5,39.14,32,12,10,12,0
2026-04-24,30,6,37.01,34,24,22,23,0
2026-05-17,4,2,10.56,5,4,3,4,0
2026-07-22,14,6,88.8,16,14,13,14,0
2026-07-05,11,0,0.83,11,11,8,8,0
2026-07-31,28,12,179.14,45,24,23,24,0
2026-08-02,10,0,14.43,11,9,8,8,0
2026-08-01,13,0,314.07,19,12,12,12,0
2026-07-31,28,12,179.14,45,24,23,24,0
2026-07-30,17,7,256.75,46,17,15,16,0
2026-08-01,13,0,314.07,19,12,12,12,0
2026-07-31,28,12,179.14,45,24,23,24,0
2026-08-02,10,0,14.43,11,9,8,8,0
2026-07-30,17,7,256.75,46,17,15,16,0
`

// MM-DD|channel|source|medium|sessions|engagedSessions|newUsers|engagementSeconds
const CHANNELS = `
08-01|Unassigned|(not set)|(not set)|6|0|0|103;07-29|Referral|alleba.com|referral|1|0|1|2;07-31|AI Assistant|perplexity.ai|ai-assistant|2|1|1|149;07-29|Referral|zapier.com|referral|1|0|0|0;07-31|Email|workflowers|email|9|2|11|0;07-29|Referral|zapier|referral|1|1|1|37;07-31|Organic Social|linkedin.com|referral|1|0|1|0;07-30|Organic Search|google|organic|2|2|2|335;07-31|Organic Search|google|organic|2|1|0|601;08-01|Organic Search|google|organic|3|0|3|67;08-01|Organic Social|linkedin|social|1|0|1|0;07-29|Referral|colorof.com|referral|1|1|1|8;07-31|Referral|ddec1-0-en-ctp.trendmicro.com|referral|1|0|1|10;07-30|Referral|wotbox.com|referral|1|0|1|1;07-29|Direct|(direct)|(none)|13|6|12|73;07-31|Email|buttondown|email|3|3|0|59;07-29|Organic Search|google|organic|5|3|3|102;07-30|Referral|123people.com|referral|1|0|1|0;07-30|Organic Social|linkedin.com|referral|1|0|1|0;07-31|Direct|(direct)|(none)|9|5|8|317;07-30|Referral|zapier|referral|1|1|1|0;07-30|Direct|(direct)|(none)|11|4|9|119;07-31|Organic Social|linkedin|social|1|0|1|0;08-01|Direct|(direct)|(none)|9|0|8|20;04-14|Referral|l.wl.co|referral|1|0|0|0;07-27|Direct|(direct)|(none)|7|0|7|9;05-13|Organic Social|linkedin.com|referral|2|1|0|61;05-03|Referral|buttondown.com|referral|1|1|0|3;04-28|Organic Search|google|organic|3|3|1|178;07-27|Organic Search|google|organic|2|2|1|34;07-09|Unassigned|docs|event|2|0|2|0;06-26|Referral|l.wl.co|referral|2|1|1|180;05-04|Referral|buttondown.com|referral|4|4|0|60;05-28|Organic Search|naver.com|referral|1|1|1|2;06-17|Unassigned|slack|community|1|1|0|9;06-16|Unassigned|slack|community|1|1|0|7;07-02|Organic Social|linkedin.com|referral|19|5|13|1374;04-25|Direct|(direct)|(none)|3|0|3|0;05-20|Direct|(direct)|(none)|20|7|18|504;05-06|Referral|oskope.com|referral|1|0|1|3;06-18|Referral|yabigo.com|referral|1|0|1|0;05-05|Referral|anoox.com|referral|1|0|1|0;07-06|Direct|(direct)|(none)|20|5|16|336;07-07|Organic Search|google|organic|1|0|0|0;06-26|Direct|(direct)|(none)|8|3|7|142;04-24|Organic Search|google|organic|3|2|3|32;05-26|Unassigned|slack|community|3|1|0|69;07-23|AI Assistant|gemini.google.com|ai-assistant|1|1|1|220;05-30|Organic Social|linkedin.com|referral|1|0|0|0;07-16|Organic Search|google|organic|5|5|5|419;06-09|Organic Social|linkedin.com|referral|1|0|1|0;06-16|Direct|(direct)|(none)|10|8|9|167;05-18|Direct|(direct)|(none)|2|0|1|0;04-22|Organic Search|google|organic|1|0|0|0;07-25|Direct|(direct)|(none)|5|3|4|252;05-31|Organic Social|linkedin.com|referral|1|1|1|159;06-29|Unassigned|slack|community|1|1|0|161;04-22|Email|workflowers|email|2|2|1|156;05-24|Referral|gigablast.com|referral|1|0|1|0;07-07|Direct|(direct)|(none)|15|5|10|76;05-01|Referral|buttondown.com|referral|2|2|0|758;07-03|Referral|sgyba.com|referral|1|0|1|0;06-29|Direct|(direct)|(none)|8|5|8|375;06-08|Referral|silobreaker.com|referral|1|0|1|2;06-28|Unassigned|(not set)|(not set)|1|0|0|0;07-09|Referral|tineye.com|referral|1|0|1|0;06-19|Referral|topsy.com|referral|1|0|1|0;07-09|Organic Social|linkedin.com|referral|2|0|0|0;07-01|AI Assistant|claude.ai|ai-assistant|1|0|1|3;07-01|Organic Social|linkedin.com|referral|13|8|11|483;05-14|Organic Social|linkedin.com|referral|3|1|1|26;04-21|Organic Social|linkedin.com|referral|1|1|1|17;05-24|Referral|oolone.com|referral|1|0|1|0;04-29|Referral|buttondown.com|referral|2|2|0|177;05-06|Organic Search|google|organic|9|2|1|533;05-23|Organic Search|google|organic|1|1|1|17;07-19|Referral|technorati.com|referral|1|1|1|34;04-16|Organic Social|m.facebook.com|referral|1|0|1|0;07-08|Direct|(direct)|(none)|8|3|7|98;07-01|Direct|(direct)|(none)|20|3|18|69;06-16|Referral|redz.com|referral|1|0|1|0;06-24|Direct|(direct)|(none)|18|3|17|23;05-20|Organic Search|bing|organic|1|0|1|0;05-15|Referral|searchirc.com|referral|1|0|1|0;07-21|Unassigned|slack|community|1|0|0|0;07-04|Organic Social|linkedin.com|referral|1|0|0|0;06-29|Referral|zeekly.com|referral|1|0|1|0;06-19|Unassigned|slack|community|1|1|0|376;05-28|Unassigned|(not set)|(not set)|1|0|0|30;04-22|Referral|form-interface-47b884.zapier.app|referral|1|1|0|23;05-26|Organic Search|google|organic|3|3|3|1194;05-19|Unassigned|notion|event|2|1|2|6;06-18|Referral|searchteam.com|referral|1|0|1|0;06-14|Organic Search|google|organic|1|0|1|1;07-23|Organic Social|linkedin|social|1|1|1|186;07-08|Organic Search|google|organic|2|1|2|17;05-21|Referral|c1109962.workflowers-bullet.pages.dev|referral|3|1|1|25;05-30|Direct|(direct)|(none)|3|0|3|0;04-20|Referral|form-interface-47b884.zapier.app|referral|3|1|0|18;05-01|Referral|picfindr.com|referral|1|0|1|2;06-21|Organic Search|google|organic|5|0|5|0;06-13|Organic Social|m.facebook.com|referral|1|0|1|0;06-10|Organic Search|google|organic|2|1|2|21;04-18|Organic Search|google|organic|2|2|1|118;05-15|Direct|(direct)|(none)|20|7|17|266;04-26|Referral|iconseeker.com|referral|1|0|1|0;05-18|Organic Search|google|organic|1|1|1|35;07-03|Direct|(direct)|(none)|15|5|9|583;06-30|Unassigned|jbexaybjfef|(not set)|1|1|1|0;04-20|Direct|(direct)|(none)|14|3|12|63;07-18|Organic Social|linkedin|social|2|0|1|0;06-30|Referral|tineye.com|referral|1|1|1|17;05-03|Direct|(direct)|(none)|7|2|5|239;07-20|Unassigned|slack|community|1|1|0|37;04-22|Organic Social|linkedin.com|referral|18|4|11|385;06-12|Referral|egerin.com|referral|1|0|1|0;06-19|Organic Social|facebook.com|referral|1|1|1|7;04-28|Direct|(direct)|(none)|10|6|6|592;05-02|Organic Search|google|organic|1|0|1|0;05-25|Organic Social|linkedin.com|referral|5|1|4|196;06-03|Organic Search|google|organic|1|0|1|1;07-04|Email|workflowers|email|1|1|1|52;07-13|Organic Social|linkedin.com|referral|2|1|1|2;05-15|Referral|jamasp.com|referral|1|0|1|0;04-25|Organic Social|linkedin.com|referral|2|0|1|0;06-06|Unassigned|slack|community|1|0|0|1;06-12|Organic Social|linkedin.com|referral|3|1|2|23;07-08|Referral|hq.zapier.com|referral|1|0|0|0;06-30|Organic Search|google|organic|1|1|1|49;05-06|Organic Social|linkedin.com|referral|6|0|4|7;05-13|Organic Search|google|organic|1|1|1|20;05-06|Referral|buttondown.com|referral|1|0|0|0;05-26|Organic Social|reddit.com|referral|2|0|1|0;05-07|Referral|l.wl.co|referral|3|0|0|0;07-14|Organic Social|linkedin.com|referral|2|1|0|0;04-21|Organic Search|google|organic|1|1|1|62;05-05|Organic Search|google|organic|7|3|3|105;04-22|Direct|(direct)|(none)|13|5|12|435;05-21|Organic Search|google|organic|3|1|0|99;07-25|Organic Social|linkedin.com|referral|1|0|0|23;07-24|Organic Social|linkedin.com|referral|1|1|1|355;06-26|Email|workflowers|email|1|1|1|201;07-21|Referral|hq.zapier.com|referral|1|0|0|0;05-28|Unassigned|discord|community|2|1|2|5;05-15|Organic Search|google|organic|4|2|1|1010;06-28|Referral|simmani.com|referral|1|0|1|2;07-27|Organic Social|linkedin.com|referral|1|1|0|0;06-19|Referral|deeperweb.com|referral|1|0|1|0;05-01|Referral|recipebridge.com|referral|1|1|1|12;04-18|Organic Social|reddit.com|referral|1|1|1|61;06-06|Organic Social|linkedin.com|referral|1|1|0|0;07-09|Direct|(direct)|(none)|17|3|17|142;04-12|Unassigned|perplexity|(not set)|1|0|1|0;06-20|Organic Search|google|organic|5|0|5|0;07-08|Referral|l.wl.co|referral|1|1|1|32;07-25|Organic Search|google|organic|1|1|0|16;04-26|Direct|(direct)|(none)|6|0|6|0;04-23|Referral|buttondown.com|referral|3|2|0|9;05-25|Direct|(direct)|(none)|12|5|10|106;06-01|Referral|iconlet.com|referral|1|0|1|0;06-14|Direct|(direct)|(none)|9|1|7|25;07-08|Organic Social|linkedin.com|referral|4|1|0|974;07-02|Unassigned|luma|(not set)|5|1|4|285;07-18|Unassigned|slack|community|1|1|0|21;06-02|Organic Search|bing|organic|1|0|1|0;06-05|Direct|(direct)|(none)|8|2|8|67;07-14|Organic Search|google|organic|1|1|1|27;07-21|Organic Social|linkedin.com|referral|2|2|1|50;06-22|Organic Search|google|organic|7|1|5|156;05-22|Referral|notion.com|referral|1|1|1|7;06-26|Unassigned|slack|community|1|0|0|3;04-21|Direct|(direct)|(none)|4|0|3|1;05-08|Organic Search|google|organic|2|1|1|74;06-08|Referral|iseek.com|referral|1|0|1|2;07-09|Referral|zapier.com|referral|1|1|1|0;07-11|Organic Search|google|organic|4|0|4|0;07-08|AI Assistant|chatgpt.com|ai-assistant|1|1|1|11;06-18|Organic Search|google|organic|4|2|3|426;07-16|Organic Social|linkedin|social|11|4|9|552;05-03|Organic Search|sogou|organic|1|0|1|0;07-08|Referral|notion.lightning.force.com|referral|2|1|1|39;05-09|Direct|(direct)|(none)|18|0|18|2;05-08|Organic Social|linkedin.com|referral|5|1|0|130;07-04|Unassigned|slack|community|1|1|0|200;04-29|Organic Social|linkedin.com|referral|2|2|1|64;07-10|Organic Social|linkedin.com|referral|1|0|0|0;07-03|Organic Search|google|organic|6|2|5|181;07-02|Organic Search|google|organic|4|3|2|135;05-02|Organic Social|threads|social|1|1|1|232;07-26|Organic Search|google|organic|2|0|1|0;07-17|AI Assistant|perplexity.ai|ai-assistant|1|1|1|126;04-14|Organic Social|linkedin.com|referral|1|1|1|2;06-11|Referral|iconlet.com|referral|1|0|1|2;05-05|Email|jbexaybjfef|email|1|1|1|0;05-08|Referral|searches.com|referral|1|1|1|14;07-22|Organic Search|google|organic|1|1|1|18;07-07|Unassigned|docs|event|1|1|1|0;05-22|Direct|(direct)|(none)|8|2|8|209;06-02|Organic Social|linkedin.com|referral|4|1|2|137;06-28|Direct|(direct)|(none)|11|2|10|193;07-18|Organic Social|m.facebook.com|referral|2|0|2|0;06-18|Direct|(direct)|(none)|16|7|8|321;05-26|Unassigned|discord|community|2|1|2|267;07-20|Organic Search|google|organic|1|0|1|0;04-27|Organic Search|google|organic|1|1|1|41;06-15|Referral|mail.google.com|referral|1|0|1|0;07-16|Direct|(direct)|(none)|16|5|17|301;07-15|Direct|(direct)|(none)|15|3|15|117;06-12|Organic Search|google|organic|1|1|1|13;05-04|Organic Search|google|organic|1|0|1|0;06-25|Unassigned|luma|(not set)|3|1|2|115;07-28|Referral|echonimo.com|referral|1|1|1|20;07-28|Organic Social|linkedin|social|2|0|2|13;07-14|Direct|(direct)|(none)|8|4|7|86;04-24|Referral|buttondown.com|referral|3|1|0|4;05-06|Direct|(direct)|(none)|18|5|14|358;07-08|Organic Social|linkedin|social|2|0|1|0;05-23|Organic Social|linkedin.com|referral|1|0|1|0;04-15|Email|workflowers|email|2|1|1|27;07-12|Referral|pipl.com|referral|1|1|1|11;07-07|Organic Social|linkedin.com|referral|2|0|0|0;07-24|Direct|(direct)|(none)|11|5|10|217;07-16|Organic Social|linkedin.com|referral|2|0|1|0;04-15|Organic Search|google|organic|4|2|3|120;05-17|Direct|(direct)|(none)|2|1|1|0;06-01|Organic Social|linkedin.com|referral|1|1|1|9;05-22|Organic Social|linkedin.com|referral|2|1|2|16;05-15|Organic Social|linkedin.com|referral|2|1|2|37;05-31|Direct|(direct)|(none)|5|4|5|110;07-08|Unassigned|slack|community|1|1|0|33;05-11|Referral|panjoy.com|referral|1|1|1|8;05-27|Organic Social|linkedin.com|referral|5|1|4|32;07-10|Unassigned|docs|event|3|0|2|0;07-04|Organic Search|google|organic|7|0|6|0;04-25|Unassigned|(not set)|(not set)|1|0|0|83;05-11|Direct|(direct)|(none)|3|2|3|11;06-08|Direct|(direct)|(none)|7|3|6|34;07-13|Organic Search|google|organic|1|0|1|2;04-24|Organic Social|linkedin.com|referral|3|1|3|21;07-12|Direct|(direct)|(none)|7|1|7|6;07-10|Referral|picfog.com|referral|1|0|1|0;05-23|Direct|(direct)|(none)|6|4|5|643;06-04|Direct|(direct)|(none)|8|3|4|14;04-29|Direct|(direct)|(none)|13|3|9|180;05-16|Organic Social|linkedin.com|referral|1|0|0|0;05-07|Organic Social|linkedin.com|referral|2|1|1|90;07-04|Direct|(direct)|(none)|12|5|11|74;04-19|Direct|(direct)|(none)|4|1|4|26;05-26|Unassigned|notion|event|1|1|0|23;04-12|Direct|(direct)|(none)|11|1|10|4;05-08|Referral|poe.com|referral|1|1|1|36;06-26|Organic Search|google|organic|2|1|1|12;05-05|Organic Search|yandex|organic|1|1|1|2;05-10|Referral|meetco.daily.co|referral|1|1|1|50;07-23|Referral|wow.com|referral|1|0|1|10;06-25|Referral|luma.com|referral|2|0|2|0;05-06|Organic Search|bing|organic|1|0|1|0;06-29|Organic Search|google|organic|5|3|3|125;04-17|Email|workflowers|email|1|1|1|89;06-11|Direct|(direct)|(none)|6|1|6|182;04-17|Organic Search|google|organic|2|2|1|18;06-19|Referral|casttv.com|referral|1|1|1|49;07-15|Email|newsletter|email|1|0|1|0;06-01|Organic Search|google|organic|2|1|0|19;04-14|Direct|(direct)|(none)|9|5|6|232;06-19|Direct|(direct)|(none)|14|4|13|157;07-01|Organic Search|google|organic|4|1|4|23;06-18|Organic Social|linkedin.com|referral|1|0|0|0;06-12|Direct|(direct)|(none)|3|0|2|0;05-10|Organic Social|linkedin.com|referral|1|1|0|1;05-20|Unassigned|notion|event|1|0|0|0;06-30|Email|workflowers|email|53|20|66|39;04-23|Direct|(direct)|(none)|11|1|9|14;04-24|Direct|(direct)|(none)|20|2|15|6;06-02|Organic Social|facebook.com|referral|1|1|1|6;07-13|Direct|(direct)|(none)|14|6|10|603;04-30|Organic Social|linkedin.com|referral|3|2|2|16;04-12|Referral|perplexity.ai|referral|1|0|1|0;06-26|Unassigned|luma|(not set)|1|1|1|110;07-02|Referral|search66.com|referral|1|0|1|0;07-05|Organic Social|linkedin.com|referral|3|0|3|9;04-15|Direct|(direct)|(none)|10|3|9|249;05-31|Unassigned|luma|(not set)|1|0|1|0;05-16|Direct|(direct)|(none)|20|7|16|756;04-30|Direct|(direct)|(none)|14|4|11|401;06-16|Organic Search|google|organic|1|1|1|16;06-05|Organic Search|google|organic|2|2|2|65;07-12|Organic Social|linkedin.com|referral|1|1|1|0;04-27|Organic Social|linkedin.com|referral|2|0|1|0;06-29|Organic Social|linkedin.com|referral|4|1|3|18;05-03|Referral|findsounds.com|referral|1|0|1|0;04-21|Referral|form-interface-47b884.zapier.app|referral|3|1|0|263;05-12|Organic Search|google|organic|1|1|1|19;04-12|Organic Social|facebook.com|referral|1|0|1|0;07-15|Referral|everystockphoto.com|referral|1|1|2|10;06-13|Unassigned|slack|community|1|1|0|19;05-01|Organic Search|google|organic|2|2|1|32;07-18|Organic Social|linkedin.com|referral|2|1|1|0;07-08|Unassigned|docs|event|5|2|4|27;06-02|Direct|(direct)|(none)|5|3|5|77;07-06|Unassigned|slack|community|2|2|0|39;06-01|Referral|devilfinder.com|referral|1|0|1|0;06-25|Direct|(direct)|(none)|18|3|17|43;06-22|AI Assistant|gemini.google.com|ai-assistant|1|1|1|192;04-28|Referral|buttondown.com|referral|5|2|0|144;04-27|Direct|(direct)|(none)|16|6|13|816;06-17|Referral|atlas.first-signal.xyz|referral|1|1|1|15;04-20|Organic Search|google|organic|1|1|0|16;05-19|Organic Search|google|organic|1|0|1|2;06-13|Direct|(direct)|(none)|14|4|9|507;05-03|Organic Search|google|organic|1|0|0|0;04-28|Organic Social|linkedin.com|referral|5|2|1|97;07-17|Organic Social|linkedin|social|4|1|3|68;06-27|Direct|(direct)|(none)|12|2|10|77;05-04|Direct|(direct)|(none)|16|5|13|245;07-03|Referral|manyget.com|referral|1|0|1|0;07-02|Referral|hotbot.com|referral|1|0|1|0;07-12|Unassigned|docs|event|1|0|1|0;07-20|Organic Social|linkedin|social|1|0|1|0;07-21|Direct|(direct)|(none)|6|1|6|83;05-22|Unassigned|slack|community|2|2|1|415;07-09|Referral|hq.zapier.com|referral|1|0|0|0;06-17|Organic Social|linkedin.com|referral|1|1|1|377;05-28|Organic Search|google|organic|1|1|0|98;04-17|Organic Social|linkedin.com|referral|2|1|1|198;04-29|Organic Search|google|organic|2|2|2|138;06-02|Organic Search|google|organic|1|0|1|0;06-21|Direct|(direct)|(none)|7|0|5|3;04-24|Referral|app.partnerstack.com|referral|1|0|1|4;07-10|Direct|(direct)|(none)|16|2|13|53;05-28|Direct|(direct)|(none)|9|1|6|29;07-18|Unassigned|(not set)|(not set)|1|0|0|1;06-07|Direct|(direct)|(none)|9|1|6|10;05-29|Organic Social|facebook.com|referral|1|1|1|7;06-08|Organic Search|google|organic|1|0|0|0;06-05|Organic Social|m.facebook.com|referral|1|0|1|0;06-14|Organic Social|linkedin.com|referral|1|1|0|18;04-18|Direct|(direct)|(none)|9|0|9|4;07-19|Direct|(direct)|(none)|5|0|5|4;06-25|Organic Search|google|organic|3|3|3|1249;05-21|Referral|seeaarch.com|referral|1|1|1|1;07-06|Organic Social|linkedin.com|referral|7|1|2|45;05-22|Organic Search|google|organic|6|2|5|93;04-16|Organic Search|google|organic|5|2|2|124;07-15|Referral|isearch.com|referral|1|0|1|5;04-15|Referral|spokeo.com|referral|1|1|1|20;06-25|Organic Social|facebook.com|referral|1|1|1|6;05-02|Organic Social|linkedin.com|referral|1|0|0|0;07-23|Referral|doubao.com|referral|1|1|1|130;06-16|Organic Social|linkedin.com|referral|1|1|1|24;05-14|Direct|(direct)|(none)|15|3|12|55;05-20|Organic Search|google|organic|4|3|4|432;07-01|Unassigned|discord|community|2|0|1|0;07-05|Organic Search|google|organic|1|0|1|0;04-17|Direct|(direct)|(none)|14|3|13|66;06-09|Direct|(direct)|(none)|10|3|7|128;07-10|Organic Search|google|organic|1|0|1|0;07-13|Unassigned|luma|(not set)|1|1|1|23;04-27|Referral|buttondown.com|referral|2|2|0|1469;05-31|Referral|spezify.com|referral|1|0|1|4;04-13|Referral|l.wl.co|referral|1|0|1|0;05-31|Organic Search|google|organic|1|1|1|43;05-10|Organic Search|google|organic|2|0|2|4;06-09|Organic Social|lnkd.in|referral|1|1|1|9;07-23|Direct|(direct)|(none)|7|0|6|11;06-08|Referral|magportal.com|referral|1|0|1|0;06-08|Referral|incogna.com|referral|1|0|1|1;06-09|Organic Search|google|organic|2|1|1|175;04-19|Organic Search|google|organic|2|2|2|55;05-13|Direct|(direct)|(none)|7|2|6|18;07-21|Organic Search|google|organic|7|4|5|405;07-17|Referral|macroglossa.com|referral|1|0|1|0;04-23|Referral|scirus.com|referral|1|0|1|0;06-22|Organic Social|linkedin.com|referral|1|1|0|3;06-15|Organic Search|google|organic|3|1|3|60;05-08|Direct|(direct)|(none)|6|1|5|162;06-23|Organic Search|google|organic|9|0|8|0;05-22|Unassigned|notion|event|1|1|0|4;07-10|Organic Search|bing|organic|2|2|1|18;05-28|Organic Social|linkedin.com|referral|4|0|1|74;07-11|Unassigned|docs|event|2|0|2|0;05-07|Direct|(direct)|(none)|10|5|10|621;07-17|Organic Social|linkedin.com|referral|1|0|1|0;07-21|AI Assistant|claude.ai|ai-assistant|2|0|1|0;06-17|Organic Search|google|organic|1|0|1|0;07-06|Unassigned|luma|(not set)|1|0|0|0;05-29|Direct|(direct)|(none)|6|3|6|56;06-19|Referral|surfwax.com|referral|1|0|1|2;06-11|Unassigned|slack|community|1|1|0|18;05-24|Referral|visvo.com|referral|1|0|1|0;06-22|Referral|sify.com|referral|1|0|1|0;06-24|Organic Search|google|organic|3|1|3|61;06-28|Unassigned|perplexity|(not set)|1|0|1|0;05-14|Organic Search|google|organic|1|1|1|46;06-05|Unassigned|slack|community|2|0|0|0;05-02|Direct|(direct)|(none)|5|2|2|75;05-13|Email|workflowers|email|3|1|2|0;05-12|Organic Social|linkedin.com|referral|2|0|1|0;06-17|Email|jbexaybjfef|email|1|0|1|0;04-18|Organic Social|m.facebook.com|referral|1|0|1|0;05-05|Referral|buttondown.com|referral|3|3|0|450;07-10|Unassigned|slack|community|3|1|0|5;05-12|Direct|(direct)|(none)|7|2|7|61;06-02|Referral|wow.com|referral|1|0|1|0;07-13|Referral|app.getgist.com|referral|2|1|1|28;07-22|Referral|zanran.com|referral|1|1|1|6;06-20|Direct|(direct)|(none)|4|0|4|0;06-23|Direct|(direct)|(none)|18|4|17|614;07-18|Direct|(direct)|(none)|11|0|11|19;05-21|Email|workflowers|email|3|0|2|0;05-19|Referral|surfwax.com|referral|1|0|1|0;07-14|Referral|agent55.com|referral|1|0|1|0;07-03|Organic Social|linkedin.com|referral|2|1|0|448;07-28|Direct|(direct)|(none)|12|3|10|49;07-02|Referral|hq.zapier.com|referral|1|0|0|0;07-26|Direct|(direct)|(none)|8|0|8|2;05-27|Unassigned|discord|community|1|0|0|4;05-29|Unassigned|notion|event|1|0|0|0;06-26|Referral|roysearch.com|referral|1|0|1|3;05-01|Organic Social|linkedin.com|referral|1|1|0|20;07-23|Referral|zanran.com|referral|1|1|1|3;07-06|Organic Search|google|organic|3|1|2|59;04-12|Referral|soso.com|referral|1|0|1|0;06-22|Referral|nate.com|referral|1|1|1|10;07-22|Direct|(direct)|(none)|12|4|11|36;05-22|Referral|c1109962.workflowers-bullet.pages.dev|referral|1|0|0|0;05-11|Organic Search|google|organic|1|1|0|17;05-21|Direct|(direct)|(none)|8|2|6|117;07-17|Direct|(direct)|(none)|15|7|16|156;07-17|Referral|activesearchresults.com|referral|1|0|1|0;04-13|Organic Social|linkedin.com|referral|1|1|1|15;06-22|Direct|(direct)|(none)|10|5|8|110;07-03|Organic Search|qwant.com|organic|1|1|1|19;06-01|Direct|(direct)|(none)|8|3|6|106;07-24|Organic Search|google|organic|7|3|4|61;04-25|Organic Social|reddit.com|referral|1|1|1|7;05-06|Email|workflowers|email|1|0|1|0;05-26|Direct|(direct)|(none)|20|6|17|111;07-20|Direct|(direct)|(none)|12|3|11|667;04-19|Referral|perplexity.ai|referral|1|0|0|0;06-26|Referral|heapr.com|referral|1|0|1|0;07-08|Organic Search|duckduckgo|organic|1|1|1|90;06-16|Referral|findsounds.com|referral|1|0|1|1;04-12|Organic Search|ask|organic|1|0|1|0;06-04|Organic Search|google|organic|2|2|2|25;05-17|Organic Search|google|organic|2|1|2|31;07-19|Organic Social|linkedin|social|1|0|0|0;06-06|Direct|(direct)|(none)|9|6|4|91;05-01|Direct|(direct)|(none)|12|8|9|458;05-10|Direct|(direct)|(none)|2|0|1|0;07-05|Direct|(direct)|(none)|7|0|4|0;05-27|Direct|(direct)|(none)|11|3|10|41;07-02|Direct|(direct)|(none)|45|10|40|1812;06-19|Organic Search|google|organic|13|2|11|76;05-20|Organic Social|linkedin.com|referral|2|0|2|0;04-16|Direct|(direct)|(none)|7|2|6|44;07-11|Direct|(direct)|(none)|14|2|13|24;05-11|Organic Social|facebook.com|referral|3|2|3|13;04-23|Organic Social|linkedin.com|referral|3|0|0|0;07-09|Organic Search|cn.bing.com|referral|1|1|1|181;05-19|Referral|soku.com|referral|1|0|1|0;06-07|Organic Social|linkedin.com|referral|2|0|2|0;07-02|Referral|scandoo.com|referral|1|0|1|2;05-26|Organic Social|linkedin.com|referral|6|2|5|33;06-17|Direct|(direct)|(none)|8|5|6|293;06-04|Unassigned|slack|community|2|2|0|98;07-06|Organic Social|lnkd.in|referral|1|0|1|0;04-14|Email|workflowers|email|1|1|0|6;06-25|Unassigned|slack|community|1|1|0|5;04-29|Organic Social|reddit.com|referral|1|1|1|29;05-08|Referral|search.spacetime.com|referral|1|0|1|0;06-30|Direct|(direct)|(none)|22|1|19|108;05-22|Unassigned|discord|community|2|1|2|38;05-19|Direct|(direct)|(none)|10|4|5|170;07-15|Organic Social|linkedin|social|1|0|1|0;04-13|Direct|(direct)|(none)|17|7|14|199;07-04|Organic Social|m.facebook.com|referral|1|0|1|0;05-25|Unassigned|slack|community|1|0|0|1;04-21|Organic Social|m.facebook.com|referral|1|0|1|0;05-24|Direct|(direct)|(none)|5|2|3|60;07-15|Organic Search|google|organic|4|4|3|416;07-14|Referral|yippy.com|referral|1|1|1|16;05-05|Organic Social|linkedin.com|referral|2|1|0|15;06-03|Organic Social|linkedin.com|referral|5|2|1|196;06-26|Referral|searchezee.com|referral|1|0|1|0;05-05|Direct|(direct)|(none)|12|7|9|996;06-15|Direct|(direct)|(none)|8|1|6|16;04-30|Referral|buttondown.com|referral|2|1|0|542;05-11|Organic Search|naver.com|referral|1|0|1|2;06-10|Direct|(direct)|(none)|10|4|10|106;05-27|Organic Search|google|organic|3|1|1|42;06-03|Direct|(direct)|(none)|3|1|3|4;06-12|Referral|webcrawler.com|referral|1|0|1|1;04-16|Organic Social|linkedin.com|referral|1|0|1|0;05-19|Organic Social|linkedin.com|referral|8|7|7|1034;04-27|Email|workflowers|email|1|1|0|136;06-02|Unassigned|(not set)|(not set)|1|0|0|22;08-02|Organic Social|linkedin.com|referral|1|0|0|0;08-02|Organic Search|google|organic|2|0|2|0;08-02|Unassigned|(not set)|(not set)|7|0|0|59;08-02|Direct|(direct)|(none)|7|0|6|12
`

// path|pageType|views|users|engagementSeconds|views28|users28|engagementSeconds28|matched|sourceTitle
const PAGES = `
/blog/notion-workers-dashboards-bi-stack|Blog Post|1|1|5|0|0|0|0|;/blog/notion-consulting|Blog Post|3|3|31|1|1|0|1|We're Now Official Notion Consulting Partners!;/blog/notion-workers-startup-dashboards|Blog Post|87|63|1620|4|5|186|1|Why Notion Workers + Dashboards are my New BI Stack;/about-us|Static Page|276|150|5537|46|33|1133|1|About Us;/blog/tags/reddit|Blog Tag|1|1|3|0|0|0|0|;/blog/slackdown|Blog Post|7|7|71|0|0|0|1|Effortlessly Convert Markdown to Slack Formatting with Zapier Functions;/blog/custom-notion-crm|Blog Post|36|24|1356|4|5|456|1|What If Your CRM Worked the Way You Do?;/html-test|Static Page|10|4|115|10|4|115|0|;/blog/knoxx-foods-ai-readiness|Blog Post|1|1|6|0|0|0|0|;/blog/zapier-tables|Blog Post|3|3|0|1|1|0|1|Zapier Tables: the Unsung Hero of Scalable and Cost-Effective Automations;/blog/notion-sessions-singapore|Blog Post|11|10|583|2|2|18|1|Singapore Leads the World on AI Adoption. Most Teams Still Don't.;/blog/notion-custom-agents|Blog Post|17|16|214|1|1|0|1|Getting Started with Notion Custom Agents;/blog/tags/design|Blog Tag|1|1|4|0|0|0|0|;/blog/tags/dataviz|Blog Tag|1|1|5|0|0|0|0|;/blog/automating-blog-post-images|Blog Post|3|3|7|2|2|7|1|Automating Blog Post Images with ChatGPT's New Image Model + Notion + Zapier;/blog/claude-design-is-my-passion|Blog Post|45|40|1042|2|2|0|1|(Claude) Design is my Passion;/404|Static Page|3|2|7|3|2|7|0|;/blog/automated-crm|Blog Post|12|10|357|4|3|1|1|How to Build an Automated CRM with Notion and Zapier;/blog/no-slop-content-workflows|Blog Post|30|12|576|1|2|68|1|How I Built a Content System That Doesn't Sound Like AI Slop;/|Home|1118|709|12337|260|196|2701|1|Home;/blog/zapier-sso|Blog Post|2|2|0|0|0|0|1|No More SSO Tax: Zapier's Security Shift Empowers Small Teams;/blog/reddit-reply-machine|Blog Post|7|5|249|0|0|0|1|Building a Reddit Reply Machine with Zapier and Notion AI;/blog/tags/crm|Blog Tag|2|1|3|0|0|0|0|;/blog/tags/chatgpt|Blog Tag|3|3|13|0|0|0|0|;/blog/tags/legal-workflows|Blog Tag|3|3|3|0|0|0|0|;/blog/tags/notion/page/3|Blog Tag|4|4|15|0|0|0|0|;/blog/zapier-hitl|Blog Post|9|7|184|2|2|181|1|Adding a Human in the Loop to your Zaps;/blog/authors/grace-tang|Blog Author|1|1|3|1|1|3|0|;/blog/ai-finance-agent|Blog Post|5|5|17|3|3|17|1|Building a Finance Assistant with Zapier Agents;/blog/automators-dilemma|Blog Post|3|3|81|0|0|0|1|The Automator's Dilemma;/blog/founder-led-design-ama-notion-head-of-design|Blog Post|7|7|61|3|3|61|1|The teams that scale write down what lives in the founder's head.;/decks/intro|Static Page|1|1|0|0|0|0|0|;/blog/tags/notion/page/4|Blog Tag|3|3|16|0|0|0|0|;/blog/tags/accounting|Blog Tag|3|3|7|0|0|0|0|;/blog/ordinary-folk|Blog Post|8|7|178|3|2|20|1|Scaling Smarter: How Ordinary Folk Built a Modern Data Stack;/blog/automating-contract-management|Blog Post|3|3|0|1|1|0|1|Can you afford to lose track of your contracts?;/blog/lessons-from-building-ai-agents|Blog Post|19|16|819|3|3|0|1|What I Learned Optimising a Multi-Turn AI Agent (the Hard Way);/blog/notion-custom-agents-vs-zapier-agents|Blog Post|21|20|307|5|5|0|1|Notion Custom Agents vs Zapier Agents: Which AI Agent Platform Should You Use?;/legal/msa|Static Page|55|38|728|9|9|90|0|;/blog/authors/dennis-chiuten|Blog Author|19|17|162|4|4|30|0|;/blog/productivity-app-bundles|Blog Post|30|29|327|16|15|97|1|How to Get Powerful Productivity Apps on the Cheap;/blog/tags/startups|Blog Tag|1|1|0|1|1|0|0|;/legal/dpa|Static Page|17|17|179|3|3|5|0|;/blog/slack-thread-summariser|Blog Post|2|2|0|0|0|0|1|Build your own Slack Thread Summarizer;/blog|Blog Index|226|110|2737|35|26|198|1|Flow Statements;/blog/ai-impact-on-jobs|Blog Post|4|3|6|2|1|6|1|AI's Impact on the Job Market;/blog/slack-info-overload|Blog Post|8|8|46|1|1|2|1|Tips for Managing Information Overload in Slack;/blog/why-i-switched-to-claude|Blog Post|21|21|122|2|2|22|1|Why I Switched from ChatGPT to Claude (and Haven't Looked Back);/blog/authors|Blog Post|1|1|0|1|1|0|0|;/blog/meeting-follow-ups|Blog Post|8|8|103|2|2|0|1|How to Never Lose a Meeting Action Item Again;/deck/intro|Static Page|1|1|0|0|0|0|0|;/notion-builders](https:/www.work.flowers/notion-builders|Static Page|3|3|2|0|0|0|0|;/blog/tags/meeting-note-takers|Blog Tag|1|1|11|0|0|0|0|;/blog/hitpay-automations|Blog Post|1|1|0|0|0|0|1|3 Time-Saving HitPay + Zapier Automations for SMEs in Asia;/blog/zapier-custom-actions|Blog Post|2|2|0|1|1|0|1|Extending Zapier with Custom Actions;/blog/ai-coding-agents-evolve-no-code|Blog Post|99|62|2886|25|14|387|1|How AI Coding Agents Are Redefining Automation;/security|Static Page|10|8|46|6|4|30|1|Security Practices & Policies;/blog/tags/web-design|Blog Tag|1|1|5|0|0|0|0|;/blog/tags/reviews|Blog Tag|1|1|0|0|0|0|0|;/blog/tags|Blog Post|1|1|2|0|0|0|0|;/blog/tableau-pulse|Blog Post|2|2|0|0|0|0|1|Making Reporting Suck Less with Tableau Pulse;/blog/custom-agent-use-cases|Blog Post|39|31|986|8|7|646|1|5 Notion Custom Agents Use Cases to Automate Your Workspace;/support|Static Page|11|10|112|3|3|30|1|Customer Support;/blog/tags/ai-skills|Blog Tag|4|4|3|2|2|1|0|;/blog/ntuc-social-listening|Blog Post|16|15|469|4|5|92|1|How NTUC automated social listening with Zapier, OpenAI, and ExportComments;/blog/tags/custom-agents|Blog Tag|2|2|1|0|0|0|0|;/blog/annoying-finance-processes|Blog Post|4|3|1|2|1|1|1|Automating the Finance Tasks Every Small Business Hates;/blog/tags/ai|Blog Tag|1|1|265|0|0|0|0|;/pricing|Static Page|35|30|318|11|11|0|1|Pricing;/customer-reviews/professional-and-knowledgable-about-several-fields|Static Page|1|1|5|0|0|0|0|;/blog/stop-troubleshooting-zaps-manually|Blog Post|26|9|928|26|9|928|1|Stop Troubleshooting your Zaps Manually. Like an Animal.;/blog/whatsapp-slack|Blog Post|10|9|97|1|1|0|1|Automating WhatsApp-to-Slack: Transforming Communication for SMEs;/submitted|Static Page|3|3|10|1|1|6|1|We'll be in touch!;/blog/ordinary-folk-data-stack|Blog Post|3|3|2|0|0|0|0|;/blog/skills-over-prompts|Blog Post|67|44|2548|4|4|356|1|Skills > Prompts: How I Teach AI to Work My Way;/privacy|Static Page|41|39|91|5|5|22|0|;/blog/how-to-streamline-employee-offboarding-and-boost-security-with-automation|Blog Post|5|5|34|1|1|0|1|How to Streamline Employee Off-boarding and Boost Security with Automation;/blog/knoxx-foods-ai-foundations|Blog Post|37|33|1053|37|33|1053|1|How Knoxx Foods Built the Operational Foundations for AI;/blog/not-the-next-salesforce|Blog Post|22|17|1273|2|3|175|1|I'm Not Vibe-Coding the Next Salesforce;/contact|Static Page|43|39|260|11|9|69|1|Contact Us;/blog/notion-ai-meeting-notes|Blog Post|32|30|573|6|6|376|1|Notion AI Meeting Notes Review: A New Era of Automated Meeting Documentation (And How It Stacks Up to Granola);/blog/invoice-processing-gemini|Blog Post|6|6|69|1|1|0|1|Zapier + Google Gemini = Zero-Touch Invoice Processing for Meta Ads;/blog/notion-crm-contact-enrichment|Blog Post|35|25|1096|4|4|35|1|Your CRM's $2,500 Enrichment Feature Costs Me Half a Cent Per Contact;/blog/slackgpt|Blog Post|16|16|1|7|7|0|0|;/blog/the-future-of-work-isnt-fully-agentic|Blog Post|12|12|25|4|3|0|1|The Future of Work Isn't (Fully) Agentic;/blog/tags/notion|Blog Tag|49|38|503|0|0|0|0|;/blog/tags/google-gemini|Blog Tag|2|1|2|0|0|0|0|;/meet-dennis)|Static Page|2|2|14|1|1|5|0|;/blog/granola|Blog Post|15|15|274|2|2|0|1|Granola.ai Review: AI-Powered Meeting Transcription Tool;/terms-of-service|Static Page|2|2|10|0|0|0|0|;/blog/three-tips|Blog Post|3|3|0|1|1|0|1|3 automation tips for small businesses (and 1 thing we won't automate away);/blog/authors/dennis-chiuten/page/3|Blog Author|1|1|3|1|1|3|0|;/blog/tags/ai-agents|Blog Tag|3|2|19|0|0|0|0|;/blog/authors/ernest-choo|Blog Author|8|6|41|2|2|2|0|;/blog/tags/notion/page/2|Blog Tag|5|5|42|0|0|0|0|;/blog/notion-mail-vs-shortwave|Blog Post|10|10|29|0|0|0|1|Notion Mail vs. Shortwave: A 2025 Showdown in AI-Powered Email;/blog/tags/case-studies|Blog Tag|112|83|1487|18|15|179|0|;/webeeui-bullet-website-builder-kit|Static Page|1|1|2|0|0|0|0|;/blog/tags/claude|Blog Tag|2|2|1|0|0|0|0|;/blog/website-redesign|Blog Post|3|3|0|1|1|0|1|Why We Ditched WordPress and Came Home to Bullet + Notion;/blog-test|Static Page|5|1|21|5|1|21|0|;/blog/tags/zapier|Blog Tag|21|16|2|0|0|0|0|;/blog/automating-notion-relationships|Blog Post|6|6|13|0|0|0|1|Updating a Relation Property in a Notion Database using Custom Actions;/blog/notion-crm-v2|Blog Post|10|7|237|4|4|2|1|Revolutionising Workflow Management: Solving 5 common CRM challenges with our custom Notion system;/blog/how-claude-cowork-does-my-job|Blog Post|81|68|2023|3|3|0|1|How Claude Cowork Does My Job While I Walk the Kids to School;/blog/make-with-notion-2025|Blog Post|3|3|6|0|0|0|1|Make with Notion 2025;/inviting-us-to-zapier|Static Page|15|12|196|2|2|8|1|Inviting Us to Your Zapier Account;/blog/tags/notion-workers|Blog Tag|6|6|16|2|2|9|0|
`

const num = (value: string | undefined) => Number(value ?? 0)

/**
 * Ids are sequential rather than random: two rows sharing an id makes React
 * reuse DOM and renders bars on top of each other, which reads as a layout bug
 * rather than a data one. The duplicate-day rows below are *supposed* to
 * collide on their day, never on their id.
 *
 * `createdAt` is synthesised from row order so `dedupeByDay`'s newest-wins rule
 * is deterministic here. The real duplicates are byte-identical, so which copy
 * survives makes no difference to any figure.
 */
export const MOCK_DAYS: DailyRow[] = DAILY.trim()
	.split("\n")
	.map((line, index) => {
		const f = line.split(",")
		return {
			id: `day-${index}`,
			day: f[0] ?? null,
			sessions: num(f[1]),
			engagedSessions: num(f[2]),
			avgSessionDuration: num(f[3]),
			views: num(f[4]),
			totalUsers: num(f[5]),
			newUsers: num(f[6]),
			keyEvents: num(f[8]),
			createdAt: `2026-08-03T${String(index).padStart(4, "0")}`,
		}
	})

export const MOCK_CHANNELS: ChannelRow[] = CHANNELS.trim()
	.split(";")
	.map((entry, index) => {
		const f = entry.split("|")
		return {
			id: `channel-${index}`,
			// The year is constant across the snapshot, so it's stripped above.
			day: `2026-${f[0]}`,
			channel: f[1] ?? "",
			source: f[2] ?? "",
			medium: f[3] ?? "",
			sessions: num(f[4]),
			engagedSessions: num(f[5]),
			newUsers: num(f[6]),
			engagementSeconds: num(f[7]),
		}
	})

export const MOCK_PAGES: PageRow[] = PAGES.trim()
	.split(";")
	.map((entry, index) => {
		const f = entry.split("|")
		return {
			id: `page-${index}`,
			path: f[0] ?? "",
			pageType: f[1] ?? "",
			views: num(f[2]),
			users: num(f[3]),
			engagementSeconds: num(f[4]),
			views28: num(f[5]),
			users28: num(f[6]),
			engagementSeconds28: num(f[7]),
			matched: f[8] === "1",
			sourceTitle: f[9] ?? "",
		}
	})

/** The day the snapshot was taken — so `?mock` ranges are stable over time. */
export const MOCK_TODAY = "2026-08-03"
