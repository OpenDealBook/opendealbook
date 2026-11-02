# State registry sources

Free and paid sources of business entity registry data for the 50 states plus DC, compared
against what OpenDealBook imports in `packages/workflows/src/leadImports/stateRegistries.ts`.
Research dated 2026-11-01.

## Summary

| Access | Count | Jurisdictions |
| --- | --- | --- |
| Free bulk file or open data API | 12 | AK, CO, CT, DC, FL, IA, IL, NY, OR, PA, TX (proxy), VT |
| Free but limited | 4 | CA (API key, per entity), OH (monthly deltas only), HI (2022 snapshot), MN (non-commercial only) |
| Paid bulk or paid API only | 24 | AR, AZ, GA, IN, KS, KY, LA, MD, ME, MT, NC, ND, NE, NJ, NV, RI, SC, SD, TN, UT, VA, WI, WV, WY |
| Web search only | 11 | AL, DE, ID, MA, MI, MO, MS, NH, NM, OK, WA |

- Free sources with any officer data: CT (full), AK (Officials file), FL (up to 6), IL
  (partial), PA (free-text parties), NY (CEO only), VT (inferred).
- Already imported: NY, CO, PA, CT, TX, IA, DC, OR. That covers 8 of the 12 free bulk
  sources; the missing four are Florida, Illinois, Alaska and Vermont.
- Of the 15 largest states, only FL, NY, PA, TX (proxy) and IL (unconfirmed) have free bulk
  files. CA, GA, NC, NJ, VA and AZ sell them. MI, MA, WA and DE have no bulk product at all.
- New York is imported from its "All Filings" table set (21M filings, 7.2M entities, all
  statuses), so dissolved and inactive entities are kept with their status.

## Decisions

| Topic | Decision |
| --- | --- |
| Budget | Free sources only for now; no paid feeds. |
| Entity status | Keep dissolved and inactive entities, not only active ones. |
| Officer data | Store names and titles only; never store residence addresses. |
| Schema | `state_registry_entity` stores the entity type plus separate principal and mailing addresses. |
| Readers | Use the principal address and fall back to mailing when principal is empty. |
| Texas | The Comptroller taxpayer address is stored as mailing. TX entity codes are decoded to labels; unknown codes are kept raw. |
| Pennsylvania | The single street address is stored as principal. |
| New York | The All Filings set replaces the active-only table. The principal executive office (address type 4) is principal; mailing is empty; the service of process address is unused. Statuses are stored as published; Suspended and Discontinued do not count as inactive. When one filing records several statuses, the most restrictive wins, in the order Inactive, Discontinued, Suspended, Active, ignoring case. The 1900-01-01 placeholder filing date is never the formation date. All CEOs and agents named on the latest filing are kept; several agents are stored joined by "; ". The switch cleared agents, principal addresses and CEOs left by the active-only table. |
| Oregon | People rows are stored with the title Authorized Representative. The mislabeled new-business feed (`esjy-u4fc`) is removed and its rows deleted. Unknown row types are ignored. |
| Kansas, Kentucky, Minnesota | Excluded (commercial use is barred or needs a paid tier). |
| California | Parked; its API is for government use only. |
| Louisiana | Per-entity API lookup considered later, not bulk import. |

## All 51 jurisdictions

The 15 largest states by business count come first, then the rest alphabetically. Confidence:
V means verified by fetching the page or API; I means inferred from search snippets,
third-party docs or memory. Cost is the cheapest route to the full data set.

| State | Access | Source | Update | Cost | Officers | Imported today | Conf. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CA | Free API (key) | [bizfile API](https://calicodev.sos.ca.gov/); bulk via bizfile bulk orders | Live; bulk per order | API pricing behind sign-up; bulk about $100 | Partial (Statement of Information) | No (parked) | V portal; I fields, price |
| TX | Free open data (proxy) | [Comptroller franchise tax 9cir-efmm](https://data.texas.gov/resource/9cir-efmm.json) | About daily | Free; SOS bulk via SOSDirect is paid | No (per entity only, from Public Information Reports) | Yes | V |
| FL | Free bulk (SFTP) | [Sunbiz data downloads](https://dos.fl.gov/sunbiz/other-services/data-downloads/); [layout](https://dos.sunbiz.org/data-definitions/cor.html) | Quarterly full, daily deltas | Free; public SFTP credentials published | Up to 6, with title and address | No | V layout; I access |
| NY | Free open data | All Filings [63wc-4exh](https://data.ny.gov/resource/63wc-4exh.json), [3gg2-jgnp](https://data.ny.gov/resource/3gg2-jgnp.json), [2tms-hftb](https://data.ny.gov/resource/2tms-hftb.json) | About weekly | Free | Chairman or CEO only; no LLC managers | Yes, all statuses (CEO, agent) | V |
| IL | Free bulk (likely) | [ilsos.gov data](https://www.ilsos.gov/data/bus_serv_home.html) | Daily (reported) | Free (reported) | Partial: corp president and secretary; LLC managers | No (licenses only) | I |
| GA | Paid bulk | [georgia.gov bulk data](https://georgia.gov/bulk-corporations-data) | Monthly FTP | $1,000 one-time, or $100 setup plus $500/month | Likely (CEO, CFO, secretary) | No | V price; I fields |
| PA | Free open data | [data.pa.gov xvd7-5r2c](https://data.pa.gov/resource/xvd7-5r2c.json) | Monthly | Free (public domain) | Partial: free-text party titles | Yes | V |
| OH | Free deltas only | [Download Business Report](https://www.ohiosos.gov/businesses/business-reports/download-business-report/) | Monthly | Free | No (not collected) | No | I |
| NC | Paid bulk | [sosnc.gov data subscriptions](https://sosnc.gov/online_services/data_subscriptions/about_the_data) | Weekly | $750 setup plus $2,000/year | Yes (officers, directors, partners) | No | V |
| MI | Search only | [michigan.gov/lara](https://www.michigan.gov/lara) | Live | Free per record; FOIA possible | Partial (corporations only) | No | I |
| NJ | Paid lists | [njportal business records](http://www.njportal.com/DOR/BusinessRecords/) | On demand | About $0.0185/record | No | No | V portal; I price |
| VA | Paid bulk | [SCC clerk search](https://cis.scc.virginia.gov); SCC purchase page | Weekly | $1,000/month prepaid | Unknown | No | I |
| WA | Search only | [ccfs.sos.wa.gov](https://ccfs.sos.wa.gov) CSV export per query | Live | Free | On portal (governors) | No (licenses only) | V |
| AZ | Paid one-off | [ACC fee schedule](https://www.azcc.gov/docs/default-source/corps-files/fee-schedules/fee-schedule-corporations6def4cc74b1a47129d16c2b1c3851bda.pdf) | Manual, non-recurring | $1,000 full extraction; $75 partial | Yes, on portal | No | V fees; I fields |
| MA | Search only | [corp.sec.state.ma.us](https://corp.sec.state.ma.us/corpweb); [Corporations Book](https://www.mass.gov/info-details/the-corporations-book) | Live; Corporations Book annual | Free | On site only | No | I |
| AK | Free bulk | [CBPL database download](https://www.commerce.alaska.gov/cbp/main/) | Daily (reported) | Free | Yes (Officials file; lags up to 2 years) | No | I |
| AL | Search only | [arc-sos.state.al.us](https://arc-sos.state.al.us) | Live | No bulk product | On detail pages | No | V |
| AR | Paid bulk | [Arkansas corp bulk data](https://portal.arkansas.gov/service/ar-corp-bulk-data-download/) | Unknown | Per record, $10 minimum | Unknown | No | V service; I price |
| CO | Free open data | [data.colorado.gov 4ykn-tg5h](https://data.colorado.gov/resource/4ykn-tg5h.json) | Daily | Free (public domain) | No (not collected) | Yes | V |
| CT | Free open data | [n7gp-d28j](https://data.ct.gov/resource/n7gp-d28j.json); principals ka36-64k6; agents qh2m-n44y | Daily | Free (public domain) | Yes (officers, directors, members, managers) | Yes (entities, principals, agents) | V |
| DE | Search only | [icis.corp.delaware.gov](https://icis.corp.delaware.gov) | Live | $10 to $20 per entity for status | No (not public record) | No | V no bulk; I rest |
| DC | Free open data | [opendata.dc.gov corporate registration](https://opendata.dc.gov/datasets/5238c4fd99c843a1bd7679a243747a8c) | Frequent | Free (CC BY 4.0) | No | Yes | V |
| HI | Free, stale | [data.honolulu.gov 9k54-ztb8](https://data.honolulu.gov/api/views/9k54-ztb8); [DCCA list builder](https://cca.hawaii.gov/?p=4188) | Last 2022-06-08 | Free snapshot; current $0.05/record | No | No | V |
| IA | Free open data | [data.iowa.gov dataset 554](https://data.iowa.gov/catalog/dataset/554) | Monthly | Free (CC BY 4.0) | No | Yes | V |
| ID | Search only | [sosbiz.idaho.gov](https://sosbiz.idaho.gov/search/business) | Live | No bulk product | No | No | I |
| IN | Paid bulk | [INBiz bulk data](https://inbiz.in.gov/Inbiz/BulkDataServices/Index) | Monthly | $8,000 one-time; $9,500 plus $500/month with updates | Possible (biennial reports) | No | V fees; I fields |
| KS | Paid list | [sos.ks.gov RAR form](https://sos.ks.gov/forms/elections/RAR.pdf) | On demand | $150 to $200 per list | No | No (excluded) | V |
| KY | Paid bulk (free non-commercial) | [sos.ky.gov bulk data](https://sos.ky.gov/bus/Pages/Bulk-Data-Service.aspx) | Monthly full; weekly and daily changes | $2,000/month commercial | Yes (officers file) | No (excluded) | V |
| LA | Paid API | [Commercial API guide](https://static.sos.la.gov/COAPI/Commercial_API_Guide.pdf) | Live, per entity | About $500/year (2020 figure) | Yes | No (per-entity later) | V |
| ME | Paid bulk | [maine.gov bulk data](https://www.maine.gov/sos/corporations-commissions/bulk-data) | Monthly; weekly updates | $600 to $1,200/month | No | No | I |
| MD | Paid bulk | [dat.maryland.gov services](https://dat.maryland.gov/Pages/Services.aspx) | Monthly; weekly option | Full file price unlisted | No | No | V |
| MN | Free non-commercial | [sos.mn.gov business data](https://www.sos.mn.gov/business-liens/business-liens-data/business-data-available/) | Monthly | $710 commercial plus license agreement | Partial (president, manager, CEO) | No (excluded) | V |
| MO | Search only | [bsd.sos.mo.gov](https://bsd.sos.mo.gov/BusinessEntity/BESearch.aspx) | Live | No bulk product found | On annual reports | No | V no bulk; I rest |
| MS | Search, Excel export | [corp.sos.ms.gov business reports](https://corp.sos.ms.gov/corpreporting/Corp/BusinessSearch3) | Live | Appears free | Not confirmed | No | I |
| MT | Paid bulk | [MT bulk layout](https://sosmt.gov/Portals/142/Business/Corp_Bulk_Download_Data_Layout.pdf) | Unknown | $0.02/record | Yes (principal rows with addresses) | No | V layout; I price |
| NE | Paid bulk | [nebraska.gov special requests](https://nebraska.gov/SpecialRequestSearches/index.cgi) | On demand; weekly to monthly | $15 per 1,000 records; $300/week to $1,000/month | No (excluded) | No | V |
| NV | Paid bulk | ORION (orion.nv.gov) | Unknown | About $25/report or $500/month | Likely | No | I |
| NH | Search only | [quickstart.sos.nh.gov](https://quickstart.sos.nh.gov/online/BusinessInquire) | Live | No bulk product found | On pages | No | I |
| NM | Search only | [enterprise.sos.nm.gov](https://enterprise.sos.nm.gov/search/business) | Live | No bulk; IPRA request possible | On pages (corporations) | No | I |
| ND | Paid bulk | [sos.nd.gov data lists](https://www.sos.nd.gov/services/data-list-requests) | One-time or monthly | $40 per entity type; $1,440/month all records | Unknown | No | V |
| OK | Search only | [sos.ok.gov corp inquiry](https://www.sos.ok.gov/corp/corpInquiryFind.aspx) | Live | $5 per 3 entities | No (held by Tax Commission) | No | I |
| OR | Free open data | [data.oregon.gov tckn-sxa6](https://data.oregon.gov/resource/tckn-sxa6.json) | Weekly | Free | No (authorized representatives only) | Yes | V |
| RI | Paid bulk | [sos.ri.gov data subscription](https://www.sos.ri.gov/divisions/business-services/business-data-hub/data-subscription) | One-time; monthly or daily | $250 one-time active; $3,000 to $3,600/year | Unknown | No | V |
| SC | Paid bulk | [scdgs.sc.gov subscriber services](https://scdgs.sc.gov/service/subscriber-services) | Unknown | $12,000/year (2016 to 2019 figure) | Unknown | No | V product; I price |
| SD | Paid bulk | [sdsos.gov database downloads](https://sdsos.gov/Business-Services/database-downloads.aspx) | Weekly or monthly | $1,500 full; $250/week or $750/month updates | Unknown | No | V |
| TN | Paid bulk | [sos.tn.gov entity database](https://sos.tn.gov/products/business-services/download-business-entity-database) | Weekly full | $1,000 full; $50 per delta | Unknown | No | I |
| UT | Paid list | [secure.utah.gov data request](https://secure.utah.gov/datarequest/) | Weekly (reported) | $0.01/record for subscribers | Yes (officers, principals, partners) | No | V |
| VT | Free bulk (login) | [bizfilings.vermont.gov](https://bizfilings.vermont.gov) bulk database download | Weekly | Free today; SOS asked to charge (H.472) | Likely | No | V free and weekly; I file |
| WV | Paid bulk | [apps.wv.gov bulk data](https://apps.wv.gov/SOS/BulkData/) | Monthly; daily new | $12,000 one-time; $1,750/month | Unknown | No | V |
| WI | Paid bulk | [dfi.wi.gov corp data services](https://dfi.wi.gov/Pages/BusinessServices/BusinessEntities/CorpDataServices.aspx) | On request; new entities monthly | Full price unstated | No (not kept) | No | V |
| WY | Paid bulk | [WY database download form](https://sos.wyo.gov/Forms/Business/General/WYSOS-BusinessDatabaseDownload.pdf) | Monthly | $10,200/year or $850/month | Partial (parties) | No | V |

## Notes on tricky states

- **Oregon.** `tckn-sxa6` row types are AUTHORIZED REPRESENTATIVE (117,835), MAILING ADDRESS
  (450,763), PRINCIPAL PLACE OF BUSINESS (562,975) and REGISTERED AGENT (452,383). Oregon
  publishes no officers. The former "OR officers" adapter read `esjy-u4fc`, which is "New
  Businesses Registered Last Month" with the same schema, so it parsed without error but was
  not an officer table. It is now removed; people rows are titled Authorized Representative.
- **New York.** Three All Filings tables, joined on the DOS ID (`corpid_num`), each hold one
  row per filing. The import reads each one grouped by DOS ID and picks each entity's current
  values by filing date and filing number, whatever order its rows arrive in. The filings
  table gives the latest name and type and the earliest real filing date. The status history
  gives the latest status, and the most restrictive one when a filing records several. The
  address table's types are documented in its column metadata: 1 service of process,
  2 registered agent, 3 chief executive officer, 4 principal executive office. Types 2 to 4
  give the agent, the CEO and the principal address of the latest filing that names one. Only about 1M of 7.2M entities have a type 4 address, so
  most New York entities have no address. The active-only table `n9v6-gdp6` is no longer read.
  A full import streams about 21M filing rows, 20M status rows and 6M address rows, about
  2.5 hours as single ordered requests.
- **Texas.** The source is the Comptroller franchise tax table, not the Secretary of State. It
  has no registered agent, and its address is the taxpayer address, stored as mailing. Officers
  exist only per entity in the Comptroller's search.
- **Florida.** The best missing free source. Quarterly full files are split into 10 zips by the
  last digit of the document number; daily delta files share the layout. Status is only A or I.
  Officers are capped at 6 per entity, with a flag when there are more. The download page
  blocked automated fetches.
- **Illinois.** The Secretary of State page blocked fetches. The fixed-width corporation and
  LLC files are reportedly free, and corporation records reportedly have no company address.
  A community mirror exists but has not been updated since 2024-01.
- **Connecticut.** About 1.5M of the 1.8M principal rows have a blank designation; the import
  maps blank to "Principal". Principal rows include residence addresses, which are not stored.
- **Pennsylvania.** One row per entity per party, and `party_type` is free text ("100% member",
  "Authorized Person"). The address type is unlabeled and is stored as principal. There is no
  status column; the dataset is described as active only.
- **Iowa.** One research lane reported the import URLs as 404; a direct check returned HTTP 200
  for both the rows and metadata endpoints.
- **California.** The bizfile API needs a subscription key, works per entity, and is limited to
  government use. Parked.
- **Kentucky and Minnesota.** Both give bulk data free to non-commercial users only.
  OpenDealBook is commercial, so both are excluded.

## Import order and status

| Step | Work | Status |
| --- | --- | --- |
| 1 | Schema: entity type, separate principal and mailing addresses; readers prefer principal and fall back to mailing | Done in e678c5d |
| 2 | Oregon: Authorized Representative title, remove the new-business feed and delete its rows | Done in e678c5d |
| 3 | Officer residence addresses | No change needed; they were never stored |
| 4 | New York All Filings: add inactive and dissolved entities via a multi-table join | Done |
| 5 | Florida: fixed-width parser and SFTP fetch, both new to the pipeline | Waits on manual browser check |
| 6 | Illinois: fixed-width corporation and LLC files | Waits on manual browser check |
| 7 | Alaska: CSV with an Officials file; fits the existing detail-adapter pattern | Waits on manual browser check |
| 8 | Vermont: weekly file behind a free login; may become paid | Waits on manual browser check |
| Later | Louisiana per-entity API lookup during diligence | Not started |
| Deferred | California, Ohio delta accumulation, Hawaii snapshot, search-only states, all paid feeds | Out of scope under the free-only decision |

## Legal and terms risks

- **Kansas.** K.S.A. 45-230 bars using names and addresses from public records to sell goods
  or services, whatever the price. Excluded.
- **Non-commercial free tiers (KY, MN).** Using them in a commercial product would breach the
  terms. Excluded.
- **Paid feed contracts (WV, GA, VA, RI, WY, NC).** Some forbid resale or showing raw records
  to customers. None were read; irrelevant while the budget is free only.
- **Scraping.** Alabama's robots.txt disallows everything. Delaware, Arizona and Vermont use
  CAPTCHAs. Illinois' search reportedly forbids bulk copying. Treat every search-only state as
  not scrapable.
- **Personal data.** Officer names are personal data. Residence addresses are never stored.
- **Unstated licenses.** TX, NY, OR, FL and the CT detail tables have no license field. Public
  record status is likely but not explicit. CC BY 4.0 (IA, DC) requires attribution.
- **Fee volatility.** Several prices come from 2016 to 2021 documents (SC, WY, LA). Vermont has
  asked for authority to charge.

## Open items

- [ ] Florida: on the Sunbiz data downloads page, confirm the published SFTP host and
      credentials, the quarterly and daily file names, and any terms of use text; check the
      files match the `cor.html` layout.
- [ ] Illinois: on the ilsos.gov data page, confirm the corporation and LLC files download
      without an account, their update frequency and layouts, and whether the file terms carry
      the search page's ban on bulk copying.
- [ ] Alaska: on the CBPL database download page, confirm the Corporations, Officials and
      Agents CSVs download freely, list their columns (status, formation date, type,
      addresses), and note the update frequency and any terms.
- [ ] Vermont: with a free bizfilings login, confirm the bulk database download exists and is
      still free, its format and fields, whether it includes officers, its weekly cadence, and
      its terms.
- [ ] Decide where to show attribution for the CC BY 4.0 sources (IA, DC).

## Sources

URLs fetched by the research. Pages that returned 403, 404 or timed out are listed separately
and are marked I in the table.

- Open data metadata and queries: data.texas.gov (`9cir-efmm`, `8gur-z4cy`), data.ny.gov
  (`n9v6-gdp6`, `63wc-4exh`, `3gg2-jgnp`, `2tms-hftb`, `k4vb-judh`), data.pa.gov
  (`xvd7-5r2c`), data.colorado.gov (`4ykn-tg5h`), data.ct.gov (`n7gp-d28j`, `ka36-64k6`,
  `qh2m-n44y`), data.oregon.gov (`tckn-sxa6`, `esjy-u4fc`), data.honolulu.gov (`9k54-ztb8`).
- [data.iowa.gov dataset 554](https://data.iowa.gov/catalog/dataset/554) and the
  idh-be.iowa.gov metadata endpoint.
- DC corporate registration item and the DC GIS business licensing feature service.
- [Florida corporate file layout](https://dos.sunbiz.org/data-definitions/cor.html).
- [California bizfile API](https://calicodev.sos.ca.gov/);
  [California business entity records](https://www.sos.ca.gov/administration/public-records-act-requests/business-entity-records).
- [North Carolina data subscriptions](https://sosnc.gov/online_services/data_subscriptions/about_the_data)
  and its manual PDF.
- [Georgia bulk corporations data](https://georgia.gov/bulk-corporations-data).
- catalog.data.gov entries for Washington corporations and Hawaii business registration.
- [New Jersey business records](http://www.njportal.com/DOR/BusinessRecords/).
- Arizona corporations fee schedule; [Delaware Division of Corporations](https://corp.delaware.gov).
- [Texas Comptroller PIR and OIR requirements](https://comptroller.texas.gov/taxes/franchise/pir-oir-filing-req.php).
- [Wisconsin DFI](https://dfi.wi.gov/Pages/BusinessServices/BusinessEntities/CorpDataServices.aspx);
  [Minnesota SOS](https://www.sos.mn.gov/business-liens/business-liens-data/business-data-available/),
  its layout PDF and commercial form; [Maryland SDAT](https://dat.maryland.gov/Pages/Services.aspx);
  Indiana bulk data fee analysis.
- [Missouri corporations](https://www.sos.mo.gov/business/corporations) and
  [reports](https://www.sos.mo.gov/fileonline/reports);
  [Utah corporations](https://commerce.utah.gov/corporations/) and
  [data request](https://secure.utah.gov/datarequest/).
- [Kentucky bulk data](https://sos.ky.gov/bus/Pages/Bulk-Data-Service.aspx);
  [Louisiana API guide](https://static.sos.la.gov/COAPI/Commercial_API_Guide.pdf);
  [Kansas RAR form](https://sos.ks.gov/forms/elections/RAR.pdf);
  [Nebraska special requests](https://nebraska.gov/SpecialRequestSearches/index.cgi);
  [Arkansas bulk data](https://portal.arkansas.gov/service/ar-corp-bulk-data-download/);
  [South Carolina subscriber services](https://scdgs.sc.gov/service/subscriber-services) and a
  South Carolina statehouse fee PDF.
- [Alabama business entity records](https://www.sos.alabama.gov/government-records/business-entity-records),
  Alabama business downloads, and arc-sos.state.al.us/robots.txt.
- [Hawaii DCCA list builder](https://cca.hawaii.gov/?p=4188); opendata.hawaii.gov search.
- [Montana layout PDF](https://sosmt.gov/Portals/142/Business/Corp_Bulk_Download_Data_Layout.pdf);
  [North Dakota data lists](https://www.sos.nd.gov/services/data-list-requests);
  [Rhode Island data subscription](https://www.sos.ri.gov/divisions/business-services/business-data-hub/data-subscription);
  [South Dakota database downloads](https://sdsos.gov/Business-Services/database-downloads.aspx)
  and subscription form; [West Virginia bulk data](https://apps.wv.gov/SOS/BulkData/) and request
  form; [Wyoming download form](https://sos.wyo.gov/Forms/Business/General/WYSOS-BusinessDatabaseDownload.pdf);
  New Mexico buyer's report help PDF; Vermont legislative testimony on Secretary of State data
  (2025).
- Third-party documentation and registers, used for field lists only and given lower trust.
- Blocked or failed (inferred only): dos.fl.gov data downloads, ilsos.gov, ohiosos.gov,
  mass.gov, Virginia SCC purchase page, apps.sos.wa.gov, commerce.alaska.gov, maine.gov,
  sosmt.gov HTML, sos.nh.gov, sos.tn.gov, nvsos.gov, INBiz, corp.sos.ms.gov,
  sos-special.ark.org, sos.ok.gov.
