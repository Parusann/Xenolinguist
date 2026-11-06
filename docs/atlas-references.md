# Atlas reference collection

The initial atlas collection contains six languages, eleven concepts and seventy forms from the pinned WOLD v4.2 research fixture. It covers English, Swahili, Kildin Saami, Sakha, Japanese and Mandarin Chinese. Vocabulary-specific citations, the CC BY 4.0 license, bibliography, Concepticon identifiers, original forms and original source columns remain attached to the imported collection. [Fixture and notices](../evaluation/fixtures/reference/wold-pilot/NOTICE.md)

The loader verifies every retained fixture file before parsing it. Its source identifier is immutable. A repeated import compares the stored source metadata, languages and forms with the verified input. A changed source under the same identifier fails. Inserts publish in one transaction. [Loader](../evaluation/src/atlas/ingest/wold.ts) · [Database importer](../cloud/src/references.ts)

The first import stored six languages and seventy forms. The repeat found the same source digest and verified the same contents without inserting duplicates. Seventeen account, upload, migration and reference-retrieval checks passed against a fresh disposable database. [Import records](verification/l4-reference-ingestion.json) · [HTTP verification](verification/l4-atlas-references.json)

~~~powershell
pwsh -NoProfile -File scripts/atlas-migrate.ps1
pwsh -NoProfile -File scripts/atlas-reference.ps1
~~~

Normal startup runs reference ingestion after migrations. It needs the local fixture files and database, with network access required only when initially acquiring runtime dependencies. Authenticated application callers can read source metadata through `GET /api/references`. The application role has read-only reference access.

Concept keys use lowercase Concepticon glosses. Source English names provide a fallback after removing a leading article. This maps supplied semantic labels to documented concepts. Missing or unmatched labels remain missing. WOLD source columns include transcription and borrowing annotations for inspection, and retain their original source interpretation.

The collection remains a reference resource for comparison. Adapter optimization uses the separate synthetic training export.
