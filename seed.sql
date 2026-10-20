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
  (2, 'College of Computer Studies Building','College of Computer Studies', 1),
  (3, 'Library',                             'Academic', 1),
  (4, 'Gymnasium',                           'Sports',   1),
  (5, 'Canteen / Food Court',                'Amenities',1),
  (6, 'Administration Building',             'Admin',    1);

-- More categories and the full list of CSPC Nabua campus places.
INSERT IGNORE INTO categories (name, slug, icon_key, sort_order, is_other) VALUES
  ('Wallets & Purses', 'wallets-purses', NULL, 70, 0),
  ('Keys & Keychains', 'keys-keychains', NULL, 80, 0),
  ('Laptops & Tablets', 'laptops-tablets', NULL, 90, 0),
  ('Phone & Computer Accessories', 'phone-computer-accessories', NULL, 100, 0),
  ('Eyeglasses & Sunglasses', 'eyeglasses-sunglasses', NULL, 110, 0),
  ('Jewelry & Watches', 'jewelry-watches', NULL, 120, 0),
  ('Umbrellas & Raincoats', 'umbrellas-raincoats', NULL, 130, 0),
  ('Bottles, Tumblers & Lunch Boxes', 'bottles-tumblers-lunchboxes', NULL, 140, 0),
  ('School & Office Supplies', 'school-office-supplies', NULL, 150, 0),
  ('Calculators & Drafting Tools', 'calculators-drafting-tools', NULL, 160, 0),
  ('Uniforms, PE & Lab Gowns', 'uniforms-pe-lab-gowns', NULL, 170, 0),
  ('Footwear', 'footwear', NULL, 180, 0),
  ('Sports Equipment', 'sports-equipment', NULL, 190, 0),
  ('Medical Items & Medicine', 'medical-items-medicine', NULL, 200, 0),
  ('Money & Payment Cards', 'money-payment-cards', NULL, 210, 0),
  ('Musical Instruments', 'musical-instruments', NULL, 220, 0),
  ('Other (please specify)', 'other', NULL, 999, 1);

INSERT IGNORE INTO locations (name, zone, is_public, is_other) VALUES
  ('Main Gate', 'Entrance & Grounds', 1, 0),
  ('Side Gate / Back Gate', 'Entrance & Grounds', 1, 0),
  ('Guard House / Security Post', 'Entrance & Grounds', 1, 0),
  ('Parking Area', 'Entrance & Grounds', 1, 0),
  ('Motorcycle & Bicycle Parking', 'Entrance & Grounds', 1, 0),
  ('Tricycle Terminal / Outside Campus Gate', 'Entrance & Grounds', 1, 0),
  ('Graduate School Building', 'Graduate School', 1, 0),
  ('Graduate School - Lobby / Entrance', 'Graduate School', 1, 0),
  ('Graduate School - 1st Floor Hallway', 'Graduate School', 1, 0),
  ('Graduate School - 2nd Floor Hallway', 'Graduate School', 1, 0),
  ('Graduate School - 3rd Floor Hallway', 'Graduate School', 1, 0),
  ('Graduate School - Stairs & Landing', 'Graduate School', 1, 0),
  ('Graduate School - Classrooms', 'Graduate School', 1, 0),
  ('Graduate School - Faculty Room', 'Graduate School', 1, 0),
  ('Graduate School - Dean''s Office', 'Graduate School', 1, 0),
  ('Graduate School - Graduate Seminar Room', 'Graduate School', 1, 0),
  ('College of Computer Studies Building', 'College of Computer Studies', 1, 0),
  ('CCS - Lobby / Entrance', 'College of Computer Studies', 1, 0),
  ('CCS - 1st Floor Hallway', 'College of Computer Studies', 1, 0),
  ('CCS - 2nd Floor Hallway', 'College of Computer Studies', 1, 0),
  ('CCS - 3rd Floor Hallway', 'College of Computer Studies', 1, 0),
  ('CCS - Stairs & Landing', 'College of Computer Studies', 1, 0),
  ('CCS - Classrooms', 'College of Computer Studies', 1, 0),
  ('CCS - Faculty Room', 'College of Computer Studies', 1, 0),
  ('CCS - Dean''s Office', 'College of Computer Studies', 1, 0),
  ('CCS - Computer Laboratory', 'College of Computer Studies', 1, 0),
  ('College of Engineering and Architecture Building', 'College of Engineering & Architecture', 1, 0),
  ('CEA - Lobby / Entrance', 'College of Engineering & Architecture', 1, 0),
  ('CEA - 1st Floor Hallway', 'College of Engineering & Architecture', 1, 0),
  ('CEA - 2nd Floor Hallway', 'College of Engineering & Architecture', 1, 0),
  ('CEA - 3rd Floor Hallway', 'College of Engineering & Architecture', 1, 0),
  ('CEA - Stairs & Landing', 'College of Engineering & Architecture', 1, 0),
  ('CEA - Classrooms', 'College of Engineering & Architecture', 1, 0),
  ('CEA - Faculty Room', 'College of Engineering & Architecture', 1, 0),
  ('CEA - Dean''s Office', 'College of Engineering & Architecture', 1, 0),
  ('CEA - Engineering & Drafting Laboratories', 'College of Engineering & Architecture', 1, 0),
  ('College of Health Sciences Building', 'College of Health Sciences', 1, 0),
  ('CHS - Lobby / Entrance', 'College of Health Sciences', 1, 0),
  ('CHS - 1st Floor Hallway', 'College of Health Sciences', 1, 0),
  ('CHS - 2nd Floor Hallway', 'College of Health Sciences', 1, 0),
  ('CHS - 3rd Floor Hallway', 'College of Health Sciences', 1, 0),
  ('CHS - Stairs & Landing', 'College of Health Sciences', 1, 0),
  ('CHS - Classrooms', 'College of Health Sciences', 1, 0),
  ('CHS - Faculty Room', 'College of Health Sciences', 1, 0),
  ('CHS - Dean''s Office', 'College of Health Sciences', 1, 0),
  ('CHS - Nursing / Skills Laboratory', 'College of Health Sciences', 1, 0),
  ('College of Tourism, Hospitality and Business Management Building', 'College of Tourism, Hospitality & Business Mgmt', 1, 0),
  ('CTHBM - Lobby / Entrance', 'College of Tourism, Hospitality & Business Mgmt', 1, 0),
  ('CTHBM - 1st Floor Hallway', 'College of Tourism, Hospitality & Business Mgmt', 1, 0),
  ('CTHBM - 2nd Floor Hallway', 'College of Tourism, Hospitality & Business Mgmt', 1, 0),
  ('CTHBM - 3rd Floor Hallway', 'College of Tourism, Hospitality & Business Mgmt', 1, 0),
  ('CTHBM - Stairs & Landing', 'College of Tourism, Hospitality & Business Mgmt', 1, 0),
  ('CTHBM - Classrooms', 'College of Tourism, Hospitality & Business Mgmt', 1, 0),
  ('CTHBM - Faculty Room', 'College of Tourism, Hospitality & Business Mgmt', 1, 0),
  ('CTHBM - Dean''s Office', 'College of Tourism, Hospitality & Business Mgmt', 1, 0),
  ('CTHBM - Hospitality & Culinary Laboratory', 'College of Tourism, Hospitality & Business Mgmt', 1, 0),
  ('College of Technological and Developmental Education Building', 'College of Technological & Developmental Education', 1, 0),
  ('CTDE - Lobby / Entrance', 'College of Technological & Developmental Education', 1, 0),
  ('CTDE - 1st Floor Hallway', 'College of Technological & Developmental Education', 1, 0),
  ('CTDE - 2nd Floor Hallway', 'College of Technological & Developmental Education', 1, 0),
  ('CTDE - 3rd Floor Hallway', 'College of Technological & Developmental Education', 1, 0),
  ('CTDE - Stairs & Landing', 'College of Technological & Developmental Education', 1, 0),
  ('CTDE - Classrooms', 'College of Technological & Developmental Education', 1, 0),
  ('CTDE - Faculty Room', 'College of Technological & Developmental Education', 1, 0),
  ('CTDE - Dean''s Office', 'College of Technological & Developmental Education', 1, 0),
  ('CTDE - Technology Shops & Workshops', 'College of Technological & Developmental Education', 1, 0),
  ('College of Arts and Sciences Building', 'College of Arts & Sciences', 1, 0),
  ('CAS - Lobby / Entrance', 'College of Arts & Sciences', 1, 0),
  ('CAS - 1st Floor Hallway', 'College of Arts & Sciences', 1, 0),
  ('CAS - 2nd Floor Hallway', 'College of Arts & Sciences', 1, 0),
  ('CAS - 3rd Floor Hallway', 'College of Arts & Sciences', 1, 0),
  ('CAS - Stairs & Landing', 'College of Arts & Sciences', 1, 0),
  ('CAS - Classrooms', 'College of Arts & Sciences', 1, 0),
  ('CAS - Faculty Room', 'College of Arts & Sciences', 1, 0),
  ('CAS - Dean''s Office', 'College of Arts & Sciences', 1, 0),
  ('CAS - Science Laboratory', 'College of Arts & Sciences', 1, 0),
  ('Office of the President', 'Administration & Offices', 1, 0),
  ('Office of the Vice Presidents', 'Administration & Offices', 1, 0),
  ('Administration Building', 'Administration & Offices', 1, 0),
  ('Registrar (Student Registration and Records)', 'Administration & Offices', 1, 0),
  ('Student Testing and Admission Office', 'Administration & Offices', 1, 0),
  ('Cashier (Cash Unit)', 'Administration & Offices', 1, 0),
  ('Accounting & Budget Unit', 'Administration & Offices', 1, 0),
  ('Supply and Property Management Unit', 'Administration & Offices', 1, 0),
  ('Human Resource Management Unit', 'Administration & Offices', 1, 0),
  ('Records and FOI Unit', 'Administration & Offices', 1, 0),
  ('General Services Unit', 'Administration & Offices', 1, 0),
  ('ICT Unit / Server Room', 'Administration & Offices', 1, 0),
  ('Information and Alumni Affairs Office', 'Administration & Offices', 1, 0),
  ('Student Affairs Services', 'Student Services', 1, 0),
  ('Guidance Counseling Office', 'Student Services', 1, 0),
  ('Health Services Unit (Clinic)', 'Student Services', 1, 0),
  ('Sports Development Office', 'Student Services', 1, 0),
  ('Cultural Affairs / Center for Rinconada Culture and the Arts', 'Student Services', 1, 0),
  ('NSTP Office', 'Student Services', 1, 0),
  ('Competency and Assessment Center', 'Student Services', 1, 0),
  ('Academic Center for Continuing Enrichment for Students (ACCESS)', 'Student Services', 1, 0),
  ('Center for Quality Assurance', 'Student Services', 1, 0),
  ('Student Organizations / Student Council Office', 'Student Services', 1, 0),
  ('Library', 'Library & Research', 1, 0),
  ('Library - Reading Area', 'Library & Research', 1, 0),
  ('Library - Computer / Internet Area', 'Library & Research', 1, 0),
  ('Learning Resources and Development Office', 'Library & Research', 1, 0),
  ('Research and Development Services Office', 'Library & Research', 1, 0),
  ('Extension and Community Services Office', 'Library & Research', 1, 0),
  ('Production and Auxiliary Services', 'Library & Research', 1, 0),
  ('Gymnasium', 'Common Areas', 1, 0),
  ('Covered Court', 'Common Areas', 1, 0),
  ('Oval / Track and Field', 'Common Areas', 1, 0),
  ('Open Court / Basketball Court', 'Common Areas', 1, 0),
  ('Quadrangle / Open Plaza', 'Common Areas', 1, 0),
  ('Flagpole Area', 'Common Areas', 1, 0),
  ('Auditorium / Function Hall', 'Common Areas', 1, 0),
  ('Chapel / Prayer Room', 'Common Areas', 1, 0),
  ('Canteen / Food Court', 'Common Areas', 1, 0),
  ('Food Stalls', 'Common Areas', 1, 0),
  ('Waiting Shed / Student Lounge', 'Common Areas', 1, 0),
  ('Covered Walkway', 'Common Areas', 1, 0),
  ('Main Hallway / Corridor', 'Common Areas', 1, 0),
  ('Comfort Rooms (CR)', 'Common Areas', 1, 0),
  ('Garden / Benches', 'Common Areas', 1, 0),
  ('Other location (please specify)', 'Other', 1, 1);

-- ---------------------------------------------------------------------
-- users  (8 rows — all ordinary users)
-- pin_salt: 32 hex chars (16 random bytes). pin_hash: 64 hex chars,
-- SHA-256(pin_salt || plaintext_pin). Demo PINs noted per row.
-- ---------------------------------------------------------------------
INSERT INTO users (id, student_no, full_name, email, pin_salt, pin_hash, contact_no, created_at) VALUES
  -- PIN: 1234
  (1, '2021-00234', 'Angelica Mae Bautista',  'angelica.bautista@cspc.edu.ph',
     '9cb2a72d8c1e393389e270994dea6259', '9edfae220b8087baa19b99f5b46dd59fe999a7ab227aaa25969378f2237ff123',
     '09171234501', DATE_SUB(NOW(), INTERVAL 200 DAY)),
  -- PIN: 5678
  (2, '2020-01187', 'Jhon Carlo Reyes',       'jhoncarlo.reyes@cspc.edu.ph',
     '01a137106deb55dc39a4e063947fff1d', '2abc254286c61c5757458ed3bcecb4cf61fd31dc430e3d01744f4509ae3e9c12',
     NULL, DATE_SUB(NOW(), INTERVAL 380 DAY)),
  -- PIN: 9021
  (3, '2022-00456', 'Maria Fe Villanueva',    'mariafe.villanueva@cspc.edu.ph',
     '8bfff8dcf8c47b54a1d322f6bddf2b22', '74d16f839fd3f3e41cae3379028967c8ee1d2a4644b20df720c365c2155a271c',
     '09182345678', DATE_SUB(NOW(), INTERVAL 90 DAY)),
  -- PIN: 3344
  (4, '2019-00789', 'Ronnel Dave Ortega',     'ronneldave.ortega@cspc.edu.ph',
     '9b475a13f1adc5c2d61134ae906ccf24', 'be99418f7a31479d4f6d6ad401ce8420ef9ec7636543f27184fb99cffa06c51b',
     NULL, DATE_SUB(NOW(), INTERVAL 640 DAY)),
  -- PIN: 7788
  (5, '2021-00912', 'Katrina Joy Mercado',    'katrinajoy.mercado@cspc.edu.ph',
     '13aade31d52c4b5dee838e029894ef13', 'e677babb426e4112147b0554f5fa7f466dd413b2ff0fc374668e851fcc87dbf0',
     '09193456789', DATE_SUB(NOW(), INTERVAL 200 DAY)),
  -- PIN: 4455
  (6, 'STF-00045', 'Ferdinand Lopez',         'ferdinand.lopez@cspc.edu.ph',
     'e77d91e4e2b472200dee45d47ae348f5', '54c6a7d071c6b82210fc7bc09f6e0eee069eb63f693be8b44f7fbeb8e4c63889',
     '09201112223', DATE_SUB(NOW(), INTERVAL 900 DAY)),
  -- PIN: 6699
  (7, 'STF-00089', 'Luz Marie Gonzales',      'luzmarie.gonzales@cspc.edu.ph',
     '112c54dd171c5a0c57be97ceb78cfa57', '0393b7fc0777bffe159d96226668d51b396524d23eb56dbc21130f3d865a4b08',
     '09204445556', DATE_SUB(NOW(), INTERVAL 700 DAY)),
  -- PIN: 1122
  (8, 'ADM-00012', 'Rey Anthony Salazar',     'reyanthony.salazar@cspc.edu.ph',
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
   'Claimant accurately described the cable repair knot before seeing the item. Verified and handed over.',
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
   'Name and ID photo year matched; handed over to the claimant.',
   DATE_SUB(NOW(), INTERVAL 45 DAY)),

  (5, 8, 2,
   'The bracelet is mine, I remember wearing it during lunch and only noticed it gone when I got back to the CCS building.',
   'It is a thin silver-toned chain bracelet with a small heart-shaped charm, slightly bent on one side from an old accident.',
   'pending', NULL, NULL, NULL, DATE_SUB(NOW(), INTERVAL 35 DAY)),

  (6, 10, 5,
   'I think this sling bag is mine, I was at the Admin building lobby that same week to process a document request.',
   'Not fully sure of the contents inside, but I recall it being grey canvas material with a front zipper pocket.',
   'rejected', 3, DATE_SUB(NOW(), INTERVAL 9 DAY),
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
-- counter_sequence  (current year, matching highest LF number issued
-- above: LF-2026-0012)
-- ---------------------------------------------------------------------
INSERT INTO counter_sequence (year, last_value) VALUES
  (2026, 12);