// @govcore/support — instance-operator support access.
//
// break-glass: time-boxed, audited, optionally two-admin-approved elevation to a
// single target org. act-as: the operate-inside-the-org handle layered on it,
// which can never outlive its parent. These tables deliberately cross the tenant
// boundary and are NOT under org-GUC RLS — authorization lives in this package.

export * from './break-glass'
export * from './act-as'
