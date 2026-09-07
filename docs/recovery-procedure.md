# Recover a small consumer migration

This procedure applies to the imported teams in the small Feedtwin deployment. The executable example is `migrationProof:runRecovery` in the example backend. It uses synthetic records. It is not a production administration command.

## Freeze before recovery

Stop writes in both implementations before inspecting either snapshot. Pause team creation, membership changes, invitation creation and acceptance, ownership changes, and workspace selection. Keep one authoritative implementation at each stage. Retain the original source snapshot, host ID mapping, and component import receipts.

Enumerate the destination teams and compare them with the host mapping. If a new team has no source mapping, create a reviewed reverse mapping before proceeding. Do not omit new teams. If the deployment is larger than the tested bounds, use a paginated recovery job with a durable checkpoint instead of this example.

## Reconcile current access

For each mapped team, read current state with `getTeamState`. Verify the returned component ID against the mapping. A missing or deleted destination must remain deleted in the recovered source. Never recreate it from the original source snapshot.

For a live team, read its current memberships using its current owner. Replace the source membership set with that verified set. Preserve the current owner and roles. Remove memberships that no longer exist. Preserve the old source membership and owner snapshot in a recovery receipt before applying changes. Commit the receipt and source update atomically. The example aborts above 100 members and makes repeat application a no-op.

Revoke outstanding destination invitations before returning to the old implementation. The example limits this operation to 100 invitations and aborts if another page exists. Deleted teams already deny invitation acceptance. Retain accepted invitation history, but do not reactivate historical token routes. Any replacement invitations require new tokens through the selected lifecycle.

Translate current preferences through the reverse ID mapping. Retain only selections allowed by the recovered memberships. Project-only selections remain a host concern. Missing or removed selections must resolve to a valid fallback or no workspace. Keep project ownership and billing public identifiers unchanged.

## Verify before routing traffic

Compare recovered roles and ownership with the current destination. Verify that removed members remain denied and deleted teams stay unavailable. Check billing identifiers and project-only permissions independently. Check private resource and signed-download authorization. Keep the original snapshot for audit; it must not become the restored authority.

Only resume one implementation after those comparisons pass. Once source writes resume, keep destination writers disabled. A recovery receipt is a checkpoint for that cutover, not an ongoing synchronization mechanism.

## Executed evidence

The example imports two teams, changes ownership, removes the former owner, creates an outstanding invitation, and deletes the other team. Recovery preserves the new owner, excludes the removed owner, revokes the pending invitation, and preserves deletion. The old source memberships remain in recovery receipts. Repeating recovery creates no duplicate receipts or grants. Component-runtime tests and the native local backend validate this path.

Preference translation and fallback have separate executable coverage in `migrationProof:runLifecycle`. The complete production adapter remains consumer-specific. This procedure is a tested recovery design for the verified small deployment, not a claim that arbitrary production data can be restored automatically.
