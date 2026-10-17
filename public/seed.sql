-- =====================================================================
-- seed.sql
-- CSPC WhereITis — Lost & Found Management System
-- CCIT 106 Midterm Project — Week 6 deliverable
-- =====================================================================
--
-- DEMO DATA ONLY. The pin_hash values below are real SHA-256(salt||pin)
-- hex digests (computed offline with Node's crypto / Python's hashlib,
-- matching exactly what middleware/identity.js recomputes at sign-in),
-- so the demo accounts actually work against /my-reports/sign-in.
-- The PINs are listed in the comments purely so graders/demo users can
-- sign in — see README "Demo accounts and seed data" for the same
-- table. This is a deliberate midterm compromise: Week 11 replaces
-- PIN + SHA-256 with real passwords + bcrypt + express-session. Do not
-- carry this pattern into a production system.
--
-- Run after schema.sql:
--   mysql -u root -p whereitis < seed.sql
-- =====================================================================

USE whereitis;

-- Reset the demo data. Child tables first, so no FK blocks the truncate.
-- seed.sql — demo data for CSPC WhereITis
-- Reseeding: FK-safe reset (children first, then parents, with FK checks disabled)

-- Reset demo data using DELETE (works with FKs on, unlike TRUNCATE)
DELETE FROM report_status_history;
DELETE FROM report_comments;
DELETE FROM bookmarks;
DELETE FROM claims;
DELETE FROM reports;
DELETE FROM users;
DELETE FROM categories;
DELETE FROM locations;
DELETE FROM counter_sequence;

-- Reset auto-increment counters so ids stay predictable for the seed data
ALTER TABLE report_status_history AUTO_INCREMENT = 1;
ALTER TABLE report_comments AUTO_INCREMENT = 1;
ALTER TABLE claims AUTO_INCREMENT = 1;
ALTER TABLE reports AUTO_INCREMENT = 1;
ALTER TABLE users AUTO_INCREMENT = 1;
ALTER TABLE categories AUTO_INCREMENT = 1;
ALTER TABLE locations AUTO_INCREMENT = 1;
-- ---------------------------------------------------------------------
-- categories  (6 rows — spec requires at least 5)
-- ---------------------------------------------------------------------
INSERT INTO categories (id, name, slug, icon_key, sort_order) VALUES
  (1, 'Bags',               'bags',               'bag',       10),
  (2, 'Gadgets',             'gadgets',            'gadget',    20),
  (3, 'IDs & Cards',         'ids-cards',          'id-card',   30),
  (4, 'Books & Documents',   'books-documents',    'book',      40),
  (5, 'Accessories',         'accessories',        'accessory', 50),
  (6, 'Clothing & Apparel',  'clothing-apparel',   'clothing',  60);

-- ---------------------------------------------------------------------
-- locations  (6 rows — spec requires at least 5)
-- ---------------------------------------------------------------------
INSERT INTO locations (id, name, zone, is_public) VALUES
  (1, 'Main Gate',                          'Entrance', 1),
  (2, 'College of Computer Studies Building','Academic', 1),
  (3, 'Library',                             'Academic', 1),
  (4, 'Gymnasium',                           'Sports',   1),
  (5, 'Canteen / Food Court',                'Amenities',1),
  (6, 'Administration Building',             'Admin',    1);

-- ---------------------------------------------------------------------
-- users  (8 rows — 5 students, 2 staff, 1 admin)
-- pin_salt: 32 hex chars (16 random bytes). pin_hash: 64 hex chars,
-- SHA-256(pin_salt || plaintext_pin). Demo PINs noted per row.
-- ---------------------------------------------------------------------
INSERT INTO users (id, student_no, full_name, email, role, pin_salt, pin_hash, contact_no, created_at) VALUES
  -- PIN: 1234
  (1, '2021-00234', 'Angelica Mae Bautista',  'angelica.bautista@cspc.edu.ph',  'student',
     '9cb2a72d8c1e393389e270994dea6259', '9edfae220b8087baa19b99f5b46dd59fe999a7ab227aaa25969378f2237ff123',
     '09171234501', DATE_SUB(NOW(), INTERVAL 200 DAY)),
  -- PIN: 5678
  (2, '2020-01187', 'Jhon Carlo Reyes',       'jhoncarlo.reyes@cspc.edu.ph',    'student',
     '01a137106deb55dc39a4e063947fff1d', '2abc254286c61c5757458ed3bcecb4cf61fd31dc430e3d01744f4509ae3e9c12',
     NULL, DATE_SUB(NOW(), INTERVAL 380 DAY)),
  -- PIN: 9021
  (3, '2022-00456', 'Maria Fe Villanueva',    'mariafe.villanueva@cspc.edu.ph', 'student',
     '8bfff8dcf8c47b54a1d322f6bddf2b22', '74d16f839fd3f3e41cae3379028967c8ee1d2a4644b20df720c365c2155a271c',
     '09182345678', DATE_SUB(NOW(), INTERVAL 90 DAY)),
  -- PIN: 3344
  (4, '2019-00789', 'Ronnel Dave Ortega',     'ronneldave.ortega@cspc.edu.ph',  'student',
     '9b475a13f1adc5c2d61134ae906ccf24', 'be99418f7a31479d4f6d6ad401ce8420ef9ec7636543f27184fb99cffa06c51b',
     NULL, DATE_SUB(NOW(), INTERVAL 640 DAY)),
  -- PIN: 7788
  (5, '2021-00912', 'Katrina Joy Mercado',    'katrinajoy.mercado@cspc.edu.ph', 'student',
     '13aade31d52c4b5dee838e029894ef13', 'e677babb426e4112147b0554f5fa7f466dd413b2ff0fc374668e851fcc87dbf0',
     '09193456789', DATE_SUB(NOW(), INTERVAL 200 DAY)),
  -- PIN: 4455 (staff)
  (6, 'STF-00045', 'Ferdinand Lopez',         'ferdinand.lopez@cspc.edu.ph',    'staff',
     'e77d91e4e2b472200dee45d47ae348f5', '54c6a7d071c6b82210fc7bc09f6e0eee069eb63f693be8b44f7fbeb8e4c63889',
     '09201112223', DATE_SUB(NOW(), INTERVAL 900 DAY)),
  -- PIN: 6699 (staff)
  (7, 'STF-00089', 'Luz Marie Gonzales',      'luzmarie.gonzales@cspc.edu.ph',  'staff',
     '112c54dd171c5a0c57be97ceb78cfa57', '0393b7fc0777bffe159d96226668d51b396524d23eb56dbc21130f3d865a4b08',
     '09204445556', DATE_SUB(NOW(), INTERVAL 700 DAY)),
  -- PIN: 1122 (admin)
  (8, 'ADM-00012', 'Rey Anthony Salazar',     'reyanthony.salazar@cspc.edu.ph', 'admin',
     '346490ec840319947bf2ae924dd7bd3d', 'c796cedc09f6647826a48d6f598ecc91bb159dc1398b58bbf074f5fffc49d543',
     '09217778889', DATE_SUB(NOW(), INTERVAL 1000 DAY));

-- ---------------------------------------------------------------------
-- reports  (12 rows — mix of lost/found, 6 categories, 6 locations,
-- dates within the last ~90 days, all five statuses represented)
-- ---------------------------------------------------------------------
INSERT INTO reports
  (id, reference_no, user_id, kind, category_id, location_id, title, description,
   occurred_on, holding_location, status, archived_reason, returned_to, returned_at,
   created_at, updated_at)
VALUES
  (1, 'LF-2026-0001', 1, 'lost', 1, 3,
   'Black Jansport backpack with keychain',
   'Lost my black Jansport backpack somewhere near the Library reading area. It has a small Totoro keychain zipper pull and a dented water bottle inside the side pocket.',
   '2026-07-03', NULL, 'open', NULL, NULL, NULL,
   DATE_SUB(NOW(), INTERVAL 83 DAY), DATE_SUB(NOW(), INTERVAL 83 DAY)),

  (2, 'LF-2026-0002', 2, 'found', 1, 3,
   'Black backpack found at Library entrance',
   'Found a black backpack (looks like Jansport) left on a bench right outside the Library entrance around closing time. Turned it over to the circulation desk for safekeeping.',
   '2026-07-05', 'Library Circulation Desk', 'matched', NULL, NULL, NULL,
   DATE_SUB(NOW(), INTERVAL 81 DAY), DATE_SUB(NOW(), INTERVAL 60 DAY)),

  (3, 'LF-2026-0003', 3, 'lost', 2, 2,
   'Lost silver wired earphones and phone charger',
   'Left my silver in-ear wired earphones and a white 20W phone charger plugged in at one of the CCS computer laboratory charging stations after our afternoon class.',
   '2026-07-10', NULL, 'claimed', NULL, NULL, NULL,
   DATE_SUB(NOW(), INTERVAL 76 DAY), DATE_SUB(NOW(), INTERVAL 55 DAY)),

  (4, 'LF-2026-0004', 6, 'found', 2, 2,
   'Earphones and charger found in CCS lab',
   'A janitor turned in a pair of silver wired earphones and a white fast charger found plugged into a wall socket in Computer Lab 3. Kept at the CCS faculty office.',
   '2026-07-11', 'CCS Faculty Office', 'claimed', NULL, NULL, NULL,
   DATE_SUB(NOW(), INTERVAL 75 DAY), DATE_SUB(NOW(), INTERVAL 54 DAY)),

  (5, 'LF-2026-0005', 4, 'lost', 3, 1,
   'Lost CSPC student ID at the Main Gate',
   'I think my CSPC student ID slipped out of my pocket while showing my bag for inspection at the Main Gate around 7 in the morning. It has my ID lace with a UAAP lanyard.',
   '2026-08-01', NULL, 'returned', NULL, 'Ronnel Dave Ortega', DATE_SUB(NOW(), INTERVAL 40 DAY),
   DATE_SUB(NOW(), INTERVAL 54 DAY), DATE_SUB(NOW(), INTERVAL 40 DAY)),

  (6, 'LF-2026-0006', 7, 'found', 3, 1,
   'Student ID found near Main Gate guardhouse',
   'The security guard on duty found a CSPC student ID lying near the guardhouse inspection table. Being held at the security office pending the owner claiming it.',
   '2026-08-01', 'Security Office - Main Gate', 'returned', NULL, 'Ronnel Dave Ortega', DATE_SUB(NOW(), INTERVAL 40 DAY),
   DATE_SUB(NOW(), INTERVAL 54 DAY), DATE_SUB(NOW(), INTERVAL 40 DAY)),

  (7, 'LF-2026-0007', 5, 'lost', 4, 4,
   'Lost Physics reviewer notebook',
   'Misplaced my spiral notebook reviewer for Physics with my handwritten notes and formula sheets, last seen somewhere around the Gymnasium bleachers during intramurals.',
   '2026-06-30', NULL, 'archived', 'Unclaimed after the 90-day holding period; no matching found report was ever filed.', NULL, NULL,
   DATE_SUB(NOW(), INTERVAL 86 DAY), DATE_SUB(NOW(), INTERVAL 5 DAY)),

  (8, 'LF-2026-0008', 1, 'found', 5, 5,
   'Found silver bracelet at the Canteen',
   'Picked up a thin silver-toned bracelet with a small heart charm on one of the canteen tables near the drinks counter. Turned it in to the canteen information counter.',
   '2026-08-15', 'Canteen Info Counter', 'open', NULL, NULL, NULL,
   DATE_SUB(NOW(), INTERVAL 40 DAY), DATE_SUB(NOW(), INTERVAL 40 DAY)),

  (9, 'LF-2026-0009', 2, 'lost', 6, 4,
   'Lost maroon CSPC PE jacket',
   'Left my maroon CSPC PE jacket hanging on the bleacher railings after PE class practice. It has my name tag sewn on the inside collar.',
   '2026-09-01', NULL, 'open', NULL, NULL, NULL,
   DATE_SUB(NOW(), INTERVAL 23 DAY), DATE_SUB(NOW(), INTERVAL 23 DAY)),

  (10, 'LF-2026-0010', 3, 'found', 1, 6,
   'Found grey sling bag at Admin lobby',
   'A grey canvas sling bag was found left on the waiting bench at the Administration Building lobby. Contains what looks like class cards and a ballpen. Kept at the lobby counter.',
   '2026-09-05', 'Admin Building Lobby', 'open', NULL, NULL, NULL,
   DATE_SUB(NOW(), INTERVAL 19 DAY), DATE_SUB(NOW(), INTERVAL 10 DAY)),

  (11, 'LF-2026-0011', 4, 'lost', 2, 5,
   'Lost blue wireless earbuds case',
   'Dropped my blue wireless earbuds charging case, possibly near the canteen tables during lunch break. The case has a small scratch on the lid and a sticker of a cat.',
   '2026-09-10', NULL, 'matched', NULL, NULL, NULL,
   DATE_SUB(NOW(), INTERVAL 14 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY)),

  (12, 'LF-2026-0012', 8, 'found', 3, 2,
   'Found CSPC faculty ID at CCS building',
   'A laminated CSPC faculty/staff ID was found on the floor near the CCS building stairwell. Currently kept at the CCS faculty office for safekeeping.',
   '2026-09-15', 'CCS Faculty Office', 'open', NULL, NULL, NULL,
   DATE_SUB(NOW(), INTERVAL 9 DAY), DATE_SUB(NOW(), INTERVAL 9 DAY));

-- ---------------------------------------------------------------------
-- claims  (6 rows — mix of pending / approved / rejected)
-- proof_text and distinguishing_features are each well over 30 chars,
-- per the cross-field validation rule in middleware/validate.js.
-- ---------------------------------------------------------------------
INSERT INTO claims
  (id, report_id, claimant_user_id, proof_text, distinguishing_features,
   status, decided_by, decided_at, decision_note, created_at)
VALUES
  (1, 2, 1,
   'This is my backpack. I bought it at the Trinoma Jansport outlet last year and I can describe the exact receipt date if needed.',
   'There is a small Totoro keychain clipped to the front zipper and a dented stainless water bottle inside the left side pocket.',
   'pending', NULL, NULL, NULL, DATE_SUB(NOW(), INTERVAL 78 DAY)),

  (2, 4, 3,
   'These are my earphones and charger, I left them plugged in at the third charging station in Computer Lab 3 after our 3pm class.',
   'The earphone cable has a small knot near the jack from a repair, and the charger brick has a faint scuff mark on one corner.',
   'approved', 6, DATE_SUB(NOW(), INTERVAL 55 DAY),
   'Claimant accurately described the cable repair knot before seeing the item. Verified and released.',
   DATE_SUB(NOW(), INTERVAL 74 DAY)),

  (3, 4, 5,
   'I also lost earphones around the same week and thought these might be mine since I also use the CCS computer laboratory often.',
   'Mine were silver wired earphones too, possibly with a small tangle near the plug, but I am honestly not fully sure of the charger.',
   'rejected', 6, DATE_SUB(NOW(), INTERVAL 55 DAY),
   'A more specific claim (repair knot detail) was approved for this item; this claim is auto-rejected per the one-approval-per-report rule.',
   DATE_SUB(NOW(), INTERVAL 70 DAY)),

  (4, 6, 4,
   'This is my student ID, I noticed it missing right after the Main Gate bag inspection that same morning around 7am.',
   'My ID lace has a UAAP-branded lanyard with a small tear near the buckle, and my ID photo is from freshman year with shorter hair.',
   'approved', 7, DATE_SUB(NOW(), INTERVAL 41 DAY),
   'Name and ID photo year matched student records on file; released to the claimant with signature.',
   DATE_SUB(NOW(), INTERVAL 45 DAY)),

  (5, 8, 2,
   'The bracelet is mine, I remember wearing it during lunch and only noticed it gone when I got back to the CCS building.',
   'It is a thin silver-toned chain bracelet with a small heart-shaped charm, slightly bent on one side from an old accident.',
   'pending', NULL, NULL, NULL, DATE_SUB(NOW(), INTERVAL 35 DAY)),

  (6, 10, 5,
   'I think this sling bag is mine, I was at the Admin building lobby that same week to process a document request.',
   'Not fully sure of the contents inside, but I recall it being grey canvas material with a front zipper pocket.',
   'rejected', 7, DATE_SUB(NOW(), INTERVAL 9 DAY),
   'Claimant could not describe the class cards or any content specifics inside the bag; proof insufficiently distinguishing.',
   DATE_SUB(NOW(), INTERVAL 12 DAY));

-- ---------------------------------------------------------------------
-- report_comments  (8 rows)
-- ---------------------------------------------------------------------
INSERT INTO report_comments (id, report_id, user_id, body, created_at) VALUES
  (1, 1, 1, 'Update: I also remembered there is a small ballpen stain near the bottom of the front pocket.', DATE_SUB(NOW(), INTERVAL 80 DAY)),
  (2, 2, 2, 'Still at the circulation desk as of this week, front desk staff can confirm on inquiry.', DATE_SUB(NOW(), INTERVAL 65 DAY)),
  (3, 3, 3, 'Forgot to mention: the charger brick is a white Xiaomi 20W fast charger, not a generic one.', DATE_SUB(NOW(), INTERVAL 74 DAY)),
  (4, 5, 4, 'Already coordinated with the Main Gate security about this, just waiting for confirmation.', DATE_SUB(NOW(), INTERVAL 50 DAY)),
  (5, 7, 5, 'If anyone found a notebook with a green cover near the Gymnasium bleachers please let me know, thank you po.', DATE_SUB(NOW(), INTERVAL 80 DAY)),
  (6, 9, 2, 'The name tag inside the collar says "J.C. Reyes" in blue permanent marker in case that helps confirm ownership.', DATE_SUB(NOW(), INTERVAL 20 DAY)),
  (7, 11, 4, 'Also checking with the canteen staff directly just in case it was already turned in but not yet logged here.', DATE_SUB(NOW(), INTERVAL 12 DAY)),
  (8, 12, 8, 'Reminder to CCS faculty: please claim personally at the faculty office with a valid ID for verification.', DATE_SUB(NOW(), INTERVAL 8 DAY));

-- ---------------------------------------------------------------------
-- bookmarks  (3 rows)
-- ---------------------------------------------------------------------
INSERT INTO bookmarks (user_id, report_id, created_at) VALUES
  (1, 9,  DATE_SUB(NOW(), INTERVAL 18 DAY)),
  (2, 11, DATE_SUB(NOW(), INTERVAL 10 DAY)),
  (3, 1,  DATE_SUB(NOW(), INTERVAL 70 DAY));

-- ---------------------------------------------------------------------
-- counter_sequence  (current year, matching highest LF number issued
-- above: LF-2026-0012)
-- ---------------------------------------------------------------------
INSERT INTO counter_sequence (year, last_value) VALUES
  (2026, 12);