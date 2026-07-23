/**
 * Effective hourly rate by client, current year to date.
 *
 * Combines Xero sales invoice revenue (accounts 200 Retainer Fees and
 * 201 Project Fees) with hours logged in Harvest, mapped via the
 * google_sheets.company_ids sheet (Fivetran sync of the master ID sheet).
 *
 * Notes on the data:
 * - The company_ids sheet contains each company several times (duplicated
 *   blocks in the source sheet), so it is deduped on harvest_client_id.
 * - Xero base currency is SGD; invoice.currency_rate is expressed as
 *   foreign units per SGD, so SGD amount = line_amount / currency_rate.
 * - Only AUTHORISED and PAID ACCREC invoices count as revenue.
 * - Clients with fewer than MIN_HOURS tracked in Harvest are excluded.
 */

export const MIN_HOURS = 10;

export const EFFECTIVE_RATE_QUERY = `
WITH companies AS (
  SELECT company_name, harvest_client_id, xero_contact_id
  FROM \`workflowers-analytics.google_sheets.company_ids\`
  WHERE harvest_client_id IS NOT NULL AND xero_contact_id IS NOT NULL
  QUALIFY ROW_NUMBER() OVER (PARTITION BY harvest_client_id ORDER BY _row) = 1
),
revenue AS (
  SELECT
    i.contact_id,
    SUM(CAST(li.line_amount AS FLOAT64) / CAST(i.currency_rate AS FLOAT64)) AS revenue_sgd,
    COUNT(DISTINCT i.invoice_id) AS invoice_count
  FROM \`workflowers-analytics.xero.invoice_line_item\` li
  JOIN \`workflowers-analytics.xero.invoice\` i USING (invoice_id)
  WHERE i.type = 'ACCREC'
    AND i.status IN ('AUTHORISED', 'PAID')
    AND i.date >= DATE_TRUNC(CURRENT_DATE('Asia/Singapore'), YEAR)
    AND li.account_code IN ('200', '201')
  GROUP BY 1
),
hours AS (
  SELECT
    client_id,
    SUM(hours) AS total_hours,
    SUM(IF(billable, hours, 0)) AS billable_hours
  FROM \`workflowers-analytics.harvest.time_entry\`
  WHERE spent_date >= DATE_TRUNC(CURRENT_DATE('Asia/Singapore'), YEAR)
    AND COALESCE(_fivetran_deleted, FALSE) = FALSE
  GROUP BY 1
)
SELECT
  TRIM(c.company_name) AS company_name,
  ROUND(COALESCE(r.revenue_sgd, 0), 2) AS revenue_sgd,
  COALESCE(r.invoice_count, 0) AS invoice_count,
  ROUND(COALESCE(h.total_hours, 0), 2) AS total_hours,
  ROUND(COALESCE(h.billable_hours, 0), 2) AS billable_hours,
  ROUND(SAFE_DIVIDE(r.revenue_sgd, h.total_hours), 2) AS effective_hourly_rate_sgd
FROM companies c
LEFT JOIN revenue r ON r.contact_id = c.xero_contact_id
LEFT JOIN hours h ON h.client_id = c.harvest_client_id
WHERE COALESCE(h.total_hours, 0) >= ${MIN_HOURS}
ORDER BY effective_hourly_rate_sgd DESC
`;
