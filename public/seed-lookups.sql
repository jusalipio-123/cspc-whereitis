-- seed-lookups.sql
-- Fills the Category and Location dropdowns on the "Report an item" form.
-- Safe to run more than once (INSERT IGNORE). Does NOT touch users or reports.
--   mysql -u root -p whereitis < seed-lookups.sql

INSERT IGNORE INTO categories (id, name, slug, icon_key, sort_order) VALUES
  (1, 'Bags',               'bags',               'bag',       10),
  (2, 'Gadgets',            'gadgets',            'gadget',    20),
  (3, 'IDs & Cards',        'ids-cards',          'id-card',   30),
  (4, 'Books & Documents',  'books-documents',    'book',      40),
  (5, 'Accessories',        'accessories',        'accessory', 50),
  (6, 'Clothing & Apparel', 'clothing-apparel',   'clothing',  60);

INSERT IGNORE INTO locations (id, name, zone, is_public) VALUES
  (1, 'Main Gate',                           'Entrance', 1),
  (2, 'College of Computer Studies Building','Academic', 1),
  (3, 'Library',                             'Academic', 1),
  (4, 'Gymnasium',                           'Sports',   1),
  (5, 'Canteen / Food Court',                'Amenities',1),
  (6, 'Administration Building',             'Admin',    1);
