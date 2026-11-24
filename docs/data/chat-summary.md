<!-- Written by docs/scripts/chat-stats.ts. Do not edit. -->

| Cost per step | HTML | zamn, skill | zamn, skill, hook | zamn, skill, Bash zamn |
|---|--:|--:|--:|--:|
| create | $0.539 | $0.714 | $0.616 | $0.661 |
| edit 1 | $0.077 | $0.085 | $0.081 | $0.105 |
| edit 2 | $0.077 | $0.084 | $0.080 | $0.109 |
| edit 3 | $0.083 | $0.087 | $0.085 | $0.106 |
| edit 4 | $0.083 | $0.136 | $0.123 | $0.130 |
| edit 5 | $0.102 | $0.140 | $0.114 | $0.157 |
| edit 6 | $0.153 | $0.124 | $0.142 | $0.188 |
| **All steps** | **$1.114** | **$1.369** | **$1.241** | **$1.457** |
| vs HTML |  | +23% | +11% | +31% |

| Cost so far | HTML | zamn, skill | zamn, skill, hook | zamn, skill, Bash zamn |
|---|--:|--:|--:|--:|
| after create | $0.539 | $0.714 (+32%) | $0.616 (+14%) | $0.661 (+23%) |
| after edit 1 | $0.616 | $0.799 (+30%) | $0.697 (+13%) | $0.767 (+25%) |
| after edit 2 | $0.692 | $0.883 (+28%) | $0.777 (+12%) | $0.876 (+26%) |
| after edit 3 | $0.776 | $0.970 (+25%) | $0.862 (+11%) | $0.982 (+27%) |
| after edit 4 | $0.858 | $1.106 (+29%) | $0.985 (+15%) | $1.112 (+30%) |
| after edit 5 | $0.960 | $1.246 (+30%) | $1.099 (+14%) | $1.269 (+32%) |
| after edit 6 | $1.114 | $1.369 (+23%) | $1.241 (+11%) | $1.457 (+31%) |

| All steps | HTML | zamn, skill | zamn, skill, hook | zamn, skill, Bash zamn |
|---|--:|--:|--:|--:|
| Cost | $1.114 | $1.369 | $1.241 | $1.457 |
| Output | 23,537 | 25,711 | 22,339 | 26,159 |
| of which thinking | 2,023 | 4,423 | 2,961 | 2,379 |
| Input | 934,945 | 1,346,822 | 1,222,541 | 1,556,700 |
| read from cache | 876,421 | 1,271,614 | 1,152,024 | 1,476,848 |
| written to cache | 58,354 | 75,006 | 70,325 | 79,644 |
| uncached | 170 | 202 | 192 | 208 |
| Model calls | 85 | 101 | 96 | 104 |
| Valid, its checks met, nothing broken | 41 of 42 | 42 of 42 | 41 of 42 | 41 of 42 |
| Needed a fix-up | 0 of 42 | 2 of 42 | 0 of 42 | 0 of 42 |
| `zamn` runs |  |  |  | 42 |
| Hook errors |  |  | 3 |  |
| Skill loaded |  | 6 of 6 | 6 of 6 | 6 of 6 |

| Cost per chat | HTML | zamn, skill | zamn, skill, hook | zamn, skill, Bash zamn |
|---|--:|--:|--:|--:|
| `article` | $0.162 | $0.202, +24% | $0.192, +19% | $0.221, +36% |
| `DashboardCards.vue` | $0.158 | $0.219, +39% | $0.194, +23% | $0.208, +32% |
| `InvoiceTable.vue` | $0.172 | $0.230, +34% | $0.182, +6% | $0.220, +28% |
| `landing` | $0.232 | $0.275, +18% | $0.268, +16% | $0.312, +35% |
| `SignupForm.vue` | $0.232 | $0.261, +12% | $0.234, +1% | $0.284, +23% |
| `TodoApp.vue` | $0.158 | $0.183, +16% | $0.170, +8% | $0.211, +33% |

6 pages, a chat each of 7 steps (write the page, then 6 edits), one run of each; claude-opus-5-5 at Claude Code's default effort through Claude Code 2.1.319, 2026-11-24. Costs are Claude Code's list-price estimates. Every figure is a page's mean over its runs, summed over the pages; the cost per chat gives the range over the runs in brackets.
