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
