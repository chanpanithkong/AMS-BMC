# Khmer terms to confirm

Khmer wording that a Khmer-speaking accountant should confirm (prompt §8, SRS NFR-USA-006).
Mark each row OK or write the preferred term. Keys refer to `messages/km.json` unless another file is named.

## Accounting terms in the interface

| Key | English | Khmer used | // REVIEW |
|---|---|---|---|
| `nav.items.accounts` | Chart of Accounts | ប្លង់គណនី | Alternative: តារាងគណនី |
| `nav.items.journals` | Journal Entries | ប្រតិបត្តិការទិនានុប្បវត្តិ | |
| `nav.items.generalLedger` | General Ledger | សៀវភៅធំ | |
| `nav.items.trialBalance` | Trial Balance | តារាងតុល្យភាពសាកល្បង | Alternative: តុល្យការសាកល្បង |
| `nav.items.periods` | Accounting Periods | គ្រាគណនេយ្យ | Alternative: កាលបរិច្ឆេទគណនេយ្យ |
| `nav.items.fxRevaluations` | FX Revaluation | ការវាយតម្លៃរូបិយប័ណ្ណឡើងវិញ | |
| `nav.items.creditNotes` | Credit Notes | ឥណទានប័ត្រ | Alternative: លិខិតឥណទាន |
| `nav.items.arAging` | Receivables Aging | អាយុកាលគណនីត្រូវទទួល | |
| `nav.items.apAging` | Payables Aging | អាយុកាលគណនីត្រូវសង | |
| `nav.items.reconciliations` | Bank Reconciliation | ការផ្ទៀងផ្ទាត់ធនាគារ | |
| `nav.items.depreciationRuns` | Depreciation Runs | ការគណនារំលស់ | |
| `nav.items.settingsFiscalYears` | Fiscal Years | ឆ្នាំសារពើពន្ធ | Alternative: ឆ្នាំហិរញ្ញវត្ថុ |
| `nav.items.settingsStatementMapping` | Statement Mapping | ការផ្គូផ្គងរបាយការណ៍ | |
| `nav.items.settingsDimensions` | Dimensions | វិមាត្រវិភាគ | |
| `nav.groups.auditTrail` | Audit Trail | ដានសវនកម្ម | |
| `nav.groups.inventory` | Inventory Integration | ការតភ្ជាប់សន្និធិ | "សន្និធិ" vs "ស្តុក" |
| `roles.CASHIER` | Cashier | បេឡាករ | |
| `roles.APO` | Accounts Payable Officer | មន្ត្រីគណនីត្រូវសង | |
| `roles.ARO` | Accounts Receivable Officer | មន្ត្រីគណនីត្រូវទទួល | |
| `finance.account.DEBIT` | Debit | ឥណពន្ធ | |
| `finance.account.CREDIT` | Credit | ឥណទាន | |
| `finance.account.types.EQUITY` | Equity | មូលធន | Alternative: មូលនិធិម្ចាស់ |
| `finance.allocation.allocate` | Allocate amount | ចំនួនកាត់កង | "allocation" as កាត់កង |
| `finance.allocation.unallocated` | Unallocated | មិនទាន់កាត់កង | |
| `finance.allocation.fxPreview` | Realised FX (preview) | លម្អៀងអត្រាប្តូរប្រាក់ដែលបានសម្រេច (មើលជាមុន) | |
| `finance.journal.balanced` | Balanced | មានតុល្យភាព | |
| `report.accrual` | Accrual | បង្គរ | |
| `report.basis` | Basis | មូលដ្ឋានគណនេយ្យ | |
| `status.POSTED` | Posted | បានកត់ត្រាចូលបញ្ជី | "post" as កត់ត្រាចូលបញ្ជី |
| `status.REVERSED` | Reversed | បានបង្វិលត្រឡប់ | |
| `status.SOFT_CLOSED` | Soft-closed | បិទបណ្តោះអាសន្ន | |
| `status.CREDITED` | Credited | បានចេញឥណទានប័ត្រ | |
| `workflow.actions.writeOff` | Write off | លុបចេញពីបញ្ជី | |
| `workflow.actions.release` | Release payment | បញ្ចេញការទូទាត់ | |
| `workflow.actions.yearEndClose` | Year-end close | បិទបញ្ជីចុងឆ្នាំ | |
| `workflow.sod.ok` | Separation of duties | ការបែងចែកភារកិច្ច | |

## Amount in words (`lib/money/words.ts`)

| Item | Khmer used | // REVIEW |
|---|---|---|
| Structure | `<number><currency> និង<number><minor unit>គត់` | Confirm word order and the closing "គត់" for vouchers |
| USD | ដុល្លារអាមេរិក / សេន | |
| KHR | រៀល (no minor unit) | |
| 10,000 and 100,000 | ម៉ឺន, សែន (e.g. 25,000 = ពីរម៉ឺនប្រាំពាន់) | Some organisations write ម្ភៃប្រាំពាន់ |
| 1,000,000,000 | មួយពាន់លាន | Alternative: មួយប៊ីលាន |
| 20 | ម្ភៃ | |

## Chart of accounts names (`mocks/db/coa.ts`, demo data only)

SRS Appendix C gives English names only; the Khmer names were written for the demo.

| Code | English | Khmer used |
|---|---|---|
| 1000 | Assets | ទ្រព្យសកម្ម |
| 1100 | Cash and cash equivalents | សាច់ប្រាក់ និងសាច់ប្រាក់សមមូល |
| 1103 | Petty cash | សាច់ប្រាក់បន្តិចបន្តួច |
| 1200 | Accounts receivable – trade | គណនីត្រូវទទួល – ពាណិជ្ជកម្ម |
| 1210 | Allowance for doubtful debts | សំវិធានធនបំណុលសង្ស័យ |
| 1300 | Inventory | សន្និធិ |
| 1400 | Prepayments | បុរេប្រទាន |
| 1410 | Input tax recoverable | ពន្ធធាតុចូលអាចទាមទារបាន |
| 1500 | Property, plant and equipment – cost | ទ្រព្យ រោងចក្រ និងបរិក្ខារ – ថ្លៃដើម |
| 1590 | Accumulated depreciation | រំលស់បង្គរ |
| 2100 | Accounts payable – trade | គណនីត្រូវសង – ពាណិជ្ជកម្ម |
| 2150 | Accrued liabilities | បំណុលបង្គរ |
| 2200 | Output tax payable | ពន្ធធាតុចេញត្រូវបង់ |
| 2300 | Customer advances / unapplied receipts | បុរេប្រទានពីអតិថិជន / បង្កាន់ដៃមិនទាន់កាត់កង |
| 3100 | Owner’s capital | ដើមទុនម្ចាស់ |
| 3200 | Retained earnings | ចំណេញរក្សាទុក |
| 3300 | Owner’s drawings | ការដកប្រាក់របស់ម្ចាស់ |
| 4900 | Sales returns and allowances | ការបង្វិលទំនិញលក់ និងការបញ្ចុះតម្លៃ |
| 5100 | Cost of goods sold | ថ្លៃដើមទំនិញបានលក់ |
| 6700 | Bad debt expense | ចំណាយបំណុលអាក្រក់ |
| 7300 / 8310 | Realised FX gain / loss | ចំណេញ / ខាតពីអត្រាប្តូរប្រាក់ដែលបានសម្រេច |
| 7400 / 8410 | Unrealised FX gain / loss | ចំណេញ / ខាតពីអត្រាប្តូរប្រាក់មិនទាន់សម្រេច |
| 8900 | Rounding differences | លម្អៀងពីការបង្គត់ |
| 9999 | Suspense | គណនីបណ្តោះអាសន្ន |

The remaining account names (rent, utilities, salaries, travel, bank charges, interest, and so on) use everyday
terms; see the file for the full list.

## Phase 2 terms (General Ledger)

| Key | English | Khmer used | // REVIEW |
|---|---|---|---|
| `gl.type.ADJUSTING` | Adjusting | កែតម្រូវ | |
| `gl.type.OPENING` | Opening balance | សមតុល្យដើមគ្រា | |
| `gl.accounts.header` | Header (account) | មេ | "គណនីមេ" for header account |
| `gl.accounts.col.normal` | Normal balance | សមតុល្យធម្មតា | |
| `gl.accounts.form.control` | Control account | គណនីត្រួតពិនិត្យ | |
| `gl.accounts.form.mapping` | Statement mapping | ការផ្គូផ្គងរបាយការណ៍ | |
| `gl.accounts.cashFlowClass.*` | Operating / Investing / Financing | ប្រតិបត្តិការ / វិនិយោគ / ហិរញ្ញប្បទាន | |
| `gl.journal.fields.postingDate` | Posting date | កាលបរិច្ឆេទកត់ត្រា | |
| `gl.journal.actions.post` | Post | កត់ត្រាចូលបញ្ជី | |
| `gl.journal.actions.reverse` | Reverse | បង្វិលត្រឡប់ | |
| `gl.journal.actions.recall` | Recall | ទាញយកមកវិញ | |
| `gl.journal.actions.delegate` | Delegate | ផ្ទេរសិទ្ធិ | |
| `gl.journal.voucher.title` | Journal voucher | ប័ណ្ណទិនានុប្បវត្តិ | |
| `gl.tb.col.opening` / `closing` | Opening / Closing | ដើមគ្រា / ចុងគ្រា | |
| `gl.periods.actions.softClose` | Soft-close | បិទបណ្តោះអាសន្ន | |
| `gl.periods.checklist.title` | Month-end checklist | បញ្ជីត្រួតពិនិត្យចុងខែ | |
| `gl.periods.actions.yearEnd` | Year-end close | បិទបញ្ជីចុងឆ្នាំ | |
| `gl.rates.type.CLOSING` | Closing rate | ចុងគ្រា | Alternative: អត្រាបិទបញ្ជី |
| Checklist tasks (`mocks/handlers/periods.ts`) | e.g. "Clear the suspense account" | សម្អាតគណនីបណ្តោះអាសន្ន | Demo text written in the mock |

## Phase 3 terms (Cash, Bank and Expenses)

| Key | English | Khmer used | // REVIEW |
|---|---|---|---|
| `cb.type.DEPOSIT` / `WITHDRAWAL` | Deposit / Withdrawal | ការដាក់ប្រាក់ / ការដកប្រាក់ | |
| `cb.type.CHARGE` | Bank charge | កម្រៃសេវាធនាគារ | |
| `cb.book.cashbook` / `bankbook` | Cashbook / Bankbook | សៀវភៅសាច់ប្រាក់ / សៀវភៅធនាគារ | |
| `cb.rec.summary.outstandingDeposits` | Outstanding deposits | ប្រាក់បញ្ញើមិនទាន់ឆ្លុះបញ្ចាំង | "deposits in transit" |
| `cb.rec.summary.unpresentedPayments` | Unpresented payments | ការទូទាត់មិនទាន់ឆ្លុះបញ្ចាំង | |
| `cb.rec.summary.adjustedBank` | Adjusted bank balance | សមតុល្យធនាគារបន្ទាប់ពីកែតម្រូវ | |
| `cb.import.status.DUPLICATE` | Duplicate | ស្ទួន | |
| `cb.tx.voucher.PAYMENT` / `RECEIPT` | Payment / Receipt voucher | ប័ណ្ណចំណាយប្រាក់ / ប័ណ្ណទទួលប្រាក់ | |
| `exp.mode.UNPAID` | Not yet paid | មិនទាន់ទូទាត់ | |
| `exp.mode.CLAIM` | Employee claim | សំណើរបស់បុគ្គលិក | Alternative: ការទាមទារសំណងរបស់បុគ្គលិក |
| `exp.alloc.title` | Allocation | ការបែងចែក | |
| Seeded account names (`mocks/db/cashbank.ts`) | e.g. "Main cash – USD" | សាច់ប្រាក់មេ – ដុល្លារ | Demo data |

## Phase 4 — receivables, payables and tax codes

Terms to confirm with a native-speaking accountant:

| English | Khmer used | Note |
| --- | --- | --- |
| Credit note | កំណត់ត្រាឥណទាន | Some firms use «ប័ណ្ណឥណទាន». |
| Aging | អាយុកាលបំណុល | |
| Unapplied receipt | បង្កាន់ដៃមិនទាន់កាត់កង | |
| Release (a payment) | បញ្ចេញការទូទាត់ | |
| Output tax / Input tax | ពន្ធធាតុចេញ / ពន្ធធាតុចូល | Consistent with the chart of accounts. |
| Tax invoice | វិក្កយបត្រ | The demo invoice layout is illustrative only. |
| Demo customer and supplier names | e.g. «សណ្ឋាគារ អង្គរ» | Generated from word lists (type + place); not checked for natural phrasing. |

## Phase 5 — reports and dashboard

| English | Khmer used | Note |
| --- | --- | --- |
| Balance Sheet | តារាងតុល្យការ | |
| Income Statement | របាយការណ៍លទ្ធផល | Also «របាយការណ៍ចំណេញខាត». |
| Cash Flow Statement | របាយការណ៍លំហូរសាច់ប្រាក់ | |
| Current-year earnings | ចំណេញឆ្នាំបច្ចុប្បន្ន | |
| Subledger | បញ្ជីរង | |
| Days sales outstanding | ចំនួនថ្ងៃប្រមូលបំណុល | |
| Pending (dashboard badge) | កំពុងរង់ចាំ / រួមបញ្ចូលការរង់ចាំ | |

## Phase 6 — fixed assets, budgets, FX revaluation, inventory, imports

| English | Khmer used | Note |
| --- | --- | --- |
| Net book value | តម្លៃសុទ្ធតាមបញ្ជី | |
| Accumulated depreciation | រំលស់បង្គរ | Same as the chart of accounts. |
| Straight-line / declining balance | បន្ទាត់ត្រង់ / សមតុល្យថយចុះ | |
| Dispose (of an asset) | លក់ចេញ / បោះបង់ | Covers both sale and scrapping; confirm a single term. |
| Superseded (budget version) | ត្រូវបានជំនួស | |
| Revaluation | ការវាយតម្លៃឡើងវិញ | |
| Weighted average cost | ថ្លៃដើមមធ្យមភាគទម្ងន់ | |
| Sign off (opening balances) | ចុះហត្ថលេខា | |
