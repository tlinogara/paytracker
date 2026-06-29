# PayTrack v2

This branch reorganizes PayTrack around monthly workflows and scoped access.

## Goal

Keep the existing commission calculation engine, then improve access, navigation, and review workflows.

## Access model

Roles:

1. sales_rep
2. brand_manager
3. general_sales_manager
4. payroll_manager
5. admin

Scopes:

1. A sales rep sees their own employee record.
2. A brand manager sees assigned brands at assigned stores.
3. A general sales manager sees assigned stores.
4. A payroll manager sees every store and can edit commission settings.
5. An admin can manage users, scopes, stores, and system setup.

## Database foundation

The first v2 migrations add:

1. user_store_access
2. user_brand_access
3. normalized role helpers
4. scoped access helper functions

The current commission tables, import flow, and payroll run tables stay in place.

## UI direction

Current labels become workflow labels:

1. Dashboard becomes Month Summary.
2. Enhancers becomes Bonus Approvals.
3. Brands becomes Team Setup.
4. Imports becomes Import Status.
5. Payroll becomes Month Close and Review Payroll.
6. Calculations becomes Commission Settings.

## Admin preview

Admin should be able to review what another role or profile is allowed to see before presenting the system to leadership. Preview mode should be read only so demo activity does not accidentally change payroll data.
