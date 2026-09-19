# Transaction spine state machine — Sprint 1

The initial persisted state for a submitted request is `SUBMITTED`. `DRAFT` is a reserved request state for a later saved-draft feature; browser form edits before submission are not persisted and no Sprint 1 endpoint creates a draft. All other states below are persisted uppercase codes.

| From | Action/actor | To | Required evidence |
|---|---|---|---|
| DRAFT | submit/customer (future) | SUBMITTED | Complete validated request |
| SUBMITTED | start review/operator | UNDER_REVIEW | Event and expected version |
| UNDER_REVIEW | request more information/operator | NEEDS_INFORMATION | Public question/message, notification row |
| NEEDS_INFORMATION | provide information/customer | UNDER_REVIEW | Customer answer event, notification row |
| UNDER_REVIEW | verify/operator | VERIFIED | Product title, supplier, RMB cost, MOQ, China freight, lead time saved |
| VERIFIED | publish quote/operator | QUOTED | Immutable quote version and line items, validity, event, notification |
| QUOTED | publish revised quote/operator | QUOTED | New immutable version; old version remains; event cites the new version |
| QUOTED | ask question/customer | QUOTED | Question event tied to current quote version; notification |
| QUOTED | approve/customer | CUSTOMER_APPROVED | Exact current quote version, unexpired quote, event/notification |
| QUOTED | decline/customer | CUSTOMER_DECLINED | Exact current quote version, event/notification |

`CUSTOMER_APPROVED` and `CUSTOMER_DECLINED` are terminal in Sprint 1. A previously approved quote is never edited or replaced. An operator may publish a revised quote only while the request is `QUOTED`, before final customer action. All invalid transitions return 409 and write no partial state. Each event records the old/new status, actor, timestamp and quote version when applicable. Questions do not mutate status; the event/notification makes them visible to operations. The operations console must show history, including old quote versions. The customer sees public events and all published quote versions, with the current version identified, but not internal notes or supplier base costs.
