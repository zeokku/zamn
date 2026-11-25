<!-- Written by docs/scripts/chat-stats.ts. Do not edit. -->

| Cost per step | HTML | zamn, skill | zamn, skill, hook | zamn, skill, Bash zamn |
|---|--:|--:|--:|--:|
| create | $0.555 | $0.777 | $0.675 | $0.748 |
| edit 1 | $0.078 | $0.087 | $0.085 | $0.105 |
| edit 2 | $0.079 | $0.085 | $0.083 | $0.105 |
| edit 3 | $0.083 | $0.093 | $0.093 | $0.122 |
| edit 4 | $0.079 | $0.095 | $0.085 | $0.113 |
| edit 5 | $0.103 | $0.112 | $0.119 | $0.150 |
| edit 6 | $0.158 | $0.138 | $0.149 | $0.198 |
| **All steps** | **$1.137** | **$1.385** | **$1.289** | **$1.540** |
| vs HTML |  | +22% | +13% | +35% |

| Cost so far | HTML | zamn, skill | zamn, skill, hook | zamn, skill, Bash zamn |
|---|--:|--:|--:|--:|
| after create | $0.555 | $0.777 (+40%) | $0.675 (+22%) | $0.748 (+35%) |
| after edit 1 | $0.634 | $0.863 (+36%) | $0.761 (+20%) | $0.852 (+35%) |
| after edit 2 | $0.713 | $0.948 (+33%) | $0.843 (+18%) | $0.957 (+34%) |
| after edit 3 | $0.796 | $1.041 (+31%) | $0.936 (+18%) | $1.079 (+36%) |
| after edit 4 | $0.875 | $1.136 (+30%) | $1.021 (+17%) | $1.192 (+36%) |
| after edit 5 | $0.979 | $1.248 (+27%) | $1.140 (+16%) | $1.342 (+37%) |
| after edit 6 | $1.137 | $1.385 (+22%) | $1.289 (+13%) | $1.540 (+35%) |

| All steps | HTML | zamn, skill | zamn, skill, hook | zamn, skill, Bash zamn |
|---|--:|--:|--:|--:|
| Cost | $1.137 | $1.385 | $1.289 | $1.540 |
| Output | 22,965 | 25,193 | 22,382 | 26,920 |
| of which thinking | 1,525 | 3,985 | 3,347 | 3,023 |
| Input | 986,338 | 1,325,905 | 1,257,610 | 1,627,677 |
| read from cache | 924,748 | 1,246,950 | 1,182,054 | 1,541,052 |
| written to cache | 61,419 | 78,768 | 75,371 | 86,422 |
| uncached | 171 | 187 | 185 | 203 |
| Model calls | 86 | 94 | 93 | 102 |
| Valid, its checks met, nothing broken | 82 of 84 | 82 of 84 | 83 of 84 | 82 of 84 |
| Needed a fix-up | 0 of 84 | 0 of 84 | 0 of 84 | 0 of 84 |
| Claude was shown an error | 0 of 84 | 1 of 84 | 0 of 84 | 6 of 84 |
| `zamn` runs |  |  |  | 37 |
| Hook errors |  |  | 0 |  |
| Skill loaded |  | 12 of 12 | 12 of 12 | 12 of 12 |

| Cost per chat | HTML | zamn, skill | zamn, skill, hook | zamn, skill, Bash zamn |
|---|--:|--:|--:|--:|
| `article` | $0.170 ($0.170–$0.170) | $0.198, +16% ($0.195–$0.202) | $0.197, +16% ($0.195–$0.198) | $0.239, +41% ($0.239–$0.240) |
| `DashboardCards.vue` | $0.160 ($0.157–$0.164) | $0.195, +21% ($0.192–$0.198) | $0.197, +23% ($0.194–$0.201) | $0.239, +49% ($0.235–$0.242) |
| `InvoiceTable.vue` | $0.176 ($0.173–$0.179) | $0.234, +33% ($0.210–$0.259) | $0.201, +14% ($0.201–$0.202) | $0.237, +35% ($0.234–$0.240) |
| `landing` | $0.238 ($0.237–$0.238) | $0.251, +6% ($0.246–$0.256) | $0.256, +8% ($0.248–$0.264) | $0.295, +24% ($0.291–$0.299) |
| `SignupForm.vue` | $0.239 ($0.235–$0.243) | $0.271, +13% ($0.263–$0.278) | $0.239, ±0% ($0.230–$0.249) | $0.303, +27% ($0.302–$0.303) |
| `TodoApp.vue` | $0.154 ($0.151–$0.158) | $0.236, +53% ($0.236–$0.237) | $0.198, +28% ($0.196–$0.200) | $0.227, +47% ($0.224–$0.230) |

6 pages, a chat each of 7 steps (write the page, then 6 edits), up to 2 runs of each; claude-opus-5-5 at Claude Code's default effort through Claude Code 2.1.319, 2026-11-24. Costs are Claude Code's list-price estimates. Every figure is a page's mean over its runs, summed over the pages; the cost per chat gives the range over the runs in brackets.
