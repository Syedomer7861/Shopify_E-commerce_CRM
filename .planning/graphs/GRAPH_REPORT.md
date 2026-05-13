# Graph Report - crm  (2026-04-27)

## Corpus Check
- 244 files · ~314,051 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 709 nodes · 1242 edges · 21 communities detected
- Extraction: 76% EXTRACTED · 24% INFERRED · 0% AMBIGUOUS · INFERRED: 296 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]

## God Nodes (most connected - your core abstractions)
1. `error()` - 192 edges
2. `output()` - 66 edges
3. `main()` - 66 edges
4. `POST()` - 62 edges
5. `GET()` - 51 edges
6. `createClient()` - 31 edges
7. `getSupabase()` - 24 edges
8. `DELETE()` - 19 edges
9. `loadConfig()` - 18 edges
10. `logAuditEvent()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `verifyInstalled()` --calls--> `error()`  [INFERRED]
  get-shit-done-for-antigravity\bin\install.js → get-shit-done-for-antigravity\get-shit-done\bin\gsd-tools.js
- `bulkGenerateTasks()` --calls--> `error()`  [INFERRED]
  scratch\bulk_generate_tasks.js → get-shit-done-for-antigravity\get-shit-done\bin\gsd-tools.js
- `applyMapping()` --calls--> `error()`  [INFERRED]
  src\app\(app)\import\page.tsx → get-shit-done-for-antigravity\get-shit-done\bin\gsd-tools.js
- `handleExportCsv()` --calls--> `error()`  [INFERRED]
  src\app\(app)\orders\page.tsx → get-shit-done-for-antigravity\get-shit-done\bin\gsd-tools.js
- `fetchAnalytics()` --calls--> `error()`  [INFERRED]
  src\app\(app)\reports\page.tsx → get-shit-done-for-antigravity\get-shit-done\bin\gsd-tools.js

## Communities

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (75): fetchData(), checkAbandonedCarts(), checkAgent(), checkCart(), testAttendance(), checkLastCarts(), run(), checkRawShiprocket() (+67 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (43): run(), run(), syncMissingAndVerifyTasks(), run(), run(), hasValidSyncSecret(), hasValidSystemSecret(), proxy() (+35 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (84): add(), handleAction(), cmdCommit(), cmdConfigEnsureSection(), cmdConfigSet(), cmdCurrentTimestamp(), cmdFindPhase(), cmdFrontmatterGet() (+76 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (35): AddCustomerModal(), createTeamMemberServer(), deleteTeamMemberServer(), updateTeamMemberPasswordServer(), AdminNotifier(), AgentHeartbeat(), run(), ChannelList() (+27 more)

### Community 4 - "Community 4"
Cohesion: 0.15
Nodes (21): logAuditEvent(), logServerAuditEvent(), logUserAction(), applyAgentFilters(), debouncedRefresh(), fetchAgentData(), fetchCustomers(), fetchDashboardData() (+13 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (21): sendAdminNotification(), fetchCustomerData(), handleClearRTO(), handleLogin(), handleSaveNote(), handleUnmask(), applyAgentFilters(), fetchMyLeaves() (+13 more)

### Community 6 - "Community 6"
Cohesion: 0.11
Nodes (13): getPresenceStatus(), exportToWhatsApp(), fetchAnalytics(), generateMasterDataPDF(), generatePDFReport(), getTrend(), getTrendValue(), handleAdvancedExport() (+5 more)

### Community 7 - "Community 7"
Cohesion: 0.31
Nodes (8): convertCommandToWorkflow(), copyDirectoryRecursive(), getGlobalDir(), install(), isGsdWorkflow(), replacePathReferences(), uninstall(), verifyInstalled()

### Community 8 - "Community 8"
Cohesion: 0.22
Nodes (2): extractPhone(), shiprocketFetch()

### Community 9 - "Community 9"
Cohesion: 0.36
Nodes (4): fetchData(), handleCreate(), handleLeaveAction(), handleRun()

### Community 10 - "Community 10"
Cohesion: 0.25
Nodes (1): setStatus()

### Community 11 - "Community 11"
Cohesion: 0.4
Nodes (3): applyMapping(), handleDrop(), handleFile()

### Community 13 - "Community 13"
Cohesion: 0.4
Nodes (3): handleFileUpload(), handleKeyDown(), handleSend()

### Community 14 - "Community 14"
Cohesion: 0.4
Nodes (2): calcIndiaTDS(), calculateResults()

### Community 15 - "Community 15"
Cohesion: 0.4
Nodes (1): handleAction()

### Community 17 - "Community 17"
Cohesion: 0.5
Nodes (1): bulkGenerateTasks()

### Community 18 - "Community 18"
Cohesion: 0.67
Nodes (2): handleUpdate(), toggleTask()

### Community 19 - "Community 19"
Cohesion: 0.5
Nodes (1): handleAddPolicy()

### Community 20 - "Community 20"
Cohesion: 0.67
Nodes (2): handleAction(), saveReview()

### Community 21 - "Community 21"
Cohesion: 0.83
Nodes (3): fmt(), getDashboardData(), getEnrichedTasks()

### Community 22 - "Community 22"
Cohesion: 1.0
Nodes (2): runAllTests(), testEndpoint()

## Knowledge Gaps
- **Thin community `Community 8`** (10 nodes): `extractAddress()`, `extractCustomerName()`, `extractEmail()`, `extractLineItems()`, `extractPhone()`, `parseShiprocketDate()`, `shiprocketFetch()`, `sleep()`, `route.ts`, `route.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 10`** (8 nodes): `countFor()`, `getStatus()`, `isHoliday()`, `nextMonth()`, `prevMonth()`, `setStatus()`, `statusCycle()`, `AttendanceRegister.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 14`** (6 nodes): `calcIndiaTDS()`, `calculateResults()`, `formatCurrency()`, `resetPolicy()`, `updatePolicy()`, `PayrollCalculator.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (5 nodes): `FMT()`, `handleAction()`, `runAll()`, `toggleSlip()`, `PayrollRun.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (4 nodes): `bulkGenerateTasks()`, `generateDeliveredTasks()`, `generateSingleTask()`, `bulk_generate_tasks.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (4 nodes): `addEmployee()`, `handleUpdate()`, `toggleTask()`, `EmployeeDirectory.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (4 nodes): `generateDoc()`, `handleAddPolicy()`, `printDoc()`, `HRDocuments.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (4 nodes): `cn()`, `handleAction()`, `saveReview()`, `HREngagement.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (3 nodes): `runAllTests()`, `testEndpoint()`, `health_check.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `error()` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 7`, `Community 9`, `Community 10`, `Community 11`, `Community 13`, `Community 15`, `Community 17`, `Community 18`, `Community 19`, `Community 20`, `Community 22`?**
  _High betweenness centrality (0.510) - this node is a cross-community bridge._
- **Why does `POST()` connect `Community 1` to `Community 8`, `Community 0`, `Community 3`, `Community 4`?**
  _High betweenness centrality (0.113) - this node is a cross-community bridge._
- **Why does `GET()` connect `Community 1` to `Community 0`, `Community 2`, `Community 3`, `Community 5`, `Community 6`?**
  _High betweenness centrality (0.097) - this node is a cross-community bridge._
- **Are the 151 inferred relationships involving `error()` (e.g. with `processQueue()` and `verifyInstalled()`) actually correct?**
  _`error()` has 151 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `output()` (e.g. with `generateMasterDataPDF()` and `generatePDFReport()`) actually correct?**
  _`output()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 15 inferred relationships involving `POST()` (e.g. with `createClient()` and `notifyAdmin()`) actually correct?**
  _`POST()` has 15 INFERRED edges - model-reasoned connections that need verification._
- **Are the 23 inferred relationships involving `GET()` (e.g. with `DELETE()` and `loadConfig()`) actually correct?**
  _`GET()` has 23 INFERRED edges - model-reasoned connections that need verification._