# Image upload storage and deployment

- Uploaded report photos are stored in `public/uploads/` by default and are served at `/uploads/<generated-name>`.
- The report's `photo_url` column stores that relative public URL. The browser never stores the authoritative copy.
- The directory is currently fixed in `middleware/upload.js` (there is no `UPLOAD_DIR` environment variable). Mount a persistent, writable disk at `public/uploads/` on your host; if you later move files outside `public/`, you must also teach Express to serve that directory at `/uploads/`.
- The upload directory must persist across application restarts/redeploys. Give the Node process write permission; do not make it executable. The app generates random filenames and checks image signatures for JPG, PNG, GIF and WebP, with a 5 MB limit.
- Back up both the MySQL database and the image directory. The database only contains image paths, not the image bytes.
- For multiple application instances, use shared persistent storage or object storage (for example, an S3-compatible bucket) and configure every instance to read the same files. Local disk on one instance is not shared across instances.
- No SQL migration is needed: the existing `reports.photo_url` column already stores the image URL/path.
