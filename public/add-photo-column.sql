-- add-photo-column.sql
-- Your reports table was created before photo support, so it has no photo_url column.
-- Run this ONCE on the whereitis database. It keeps all existing data.
-- (If it says "Duplicate column name 'photo_url'", the column is already there - nothing to do.)
ALTER TABLE reports ADD COLUMN photo_url VARCHAR(500) NULL AFTER holding_location;
