-- Run once: publishes any guest reports that were waiting for approval
-- before guest reports became public immediately.
UPDATE reports SET moderation_status = 'approved' WHERE moderation_status = 'pending';
