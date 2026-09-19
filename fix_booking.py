from pathlib import Path

p = Path("api/[...path].js")
s = p.read_text()

s = s.replace(
    "await writeJsonBlob(DB_KEY, c.db, c.etag);",
    "await writeJsonBlob(DB_KEY, c.db, c.etag, true);"
)

s = s.replace(
    "async function writeJsonBlob(key, data, etag) {",
    "async function writeJsonBlob(key, data, etag, forceOverwrite = false) {"
)

s = s.replace(
    "etag ? { allowOverwrite: true, ifMatch: etag } : { allowOverwrite: false }",
    "forceOverwrite ? { allowOverwrite: true } : (etag ? { allowOverwrite: true, ifMatch: etag } : { allowOverwrite: false })"
)

p.write_text(s)
print("Booking conflict fix applied.")
