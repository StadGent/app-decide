# app-decide (StadGent fork) — Deploy Guide

## 0. What you're deploying
A single monolithic `docker-compose.yml`: Virtuoso + mu-auth (sparql-parser) +
mu-cl-resources + delta-notifier + migrations + frontend + job controllers + the
NER/NEL AI pipeline (geocoding `0.2.4`, entity-linking `0.2.4`, Nominatim) +
mu-search/Elastic. **No GPU required** — translation/segmentation/linking run on
hosted Mistral.

## 1. Prerequisites
- Docker Engine + Compose v2.
- **Disk**: budget ~50 GB+ — `data/db` (~3 GB, grows), `data/files` (~13 GB
  harvested files), `data/nominatim` (~19 GB after OSM import), Elastic.
- **RAM**: Virtuoso, Elastic and Nominatim/Postgres are the hungry ones
  (8–16 GB comfortable).
- A **Mistral API key** (paid — this stack has no local LLM fallback).

## 2. Code + secrets
```bash
git clone <your-fork> app-decide && cd app-decide
printf 'MISTRAL_API_KEY=%s\n' 'sk-...' > .env      # the ONLY interpolated secret
```
**Validate the key before anything else** (a bad key silently kills translation →
whole pipeline):
```bash
curl -s -o /dev/null -w '%{http_code}\n' https://api.mistral.ai/v1/models \
  -H "Authorization: Bearer $(grep -Po '(?<=MISTRAL_API_KEY=).*' .env)"   # expect 200
```

## 3. Bring your existing store in
If you already have old-harvesting data, mount it — don't reimport:
- **Virtuoso DB** → `./data/db` (mount your existing dir, or restore a Virtuoso
  backup here). Keep `./config/virtuoso/virtuoso.ini`.
- **Harvested files** → `./data/files` (bring along if the old data references
  file/remote objects).
- The app expects graphs `harvesting` and `public` and will create `public/gent`,
  `public/pdf`, `bestuurseenheden-bestuursorganen`, etc.

## 4. ⚠️ Access control is the #1 "my data is invisible" trap
mu-auth (`sparql-parser`, loading `config/authorization/decide.lisp`) enforces
per-graph access. **Triples in Virtuoso that no `define-graph` block grants are
invisible through the app** — even though they're physically there.

`decide.lisp` already grants: `harvesting`, `public`, `public/gent`,
`public/pdf`, `public/human-validation`, `bestuurseenheden-bestuursorganen`,
`ai`, `organizations`. So old harvesting/public data is covered. **But see §5 for
any external graph.**

## 5. An external annotations graph
If an outside process wrote annotations into their own graph, decide **before
boot**:

1. **Grant it.** If the graph name isn't one of the above, add a `define-graph`
   in `decide.lisp` for it with read (and write, if services touch it) for the
   right groups — otherwise it's invisible through the app.
2. **Keep it separate from `public/pdf`.** The app's *own* NEL writes annotations
   to `public/pdf` (`AI_GRAPH`). Land external ones in their own graph so the two
   provenance streams don't merge unless you intend it.
3. **Model + search.** For external annotations to show in the frontend / be
   searchable, they must (a) follow the `oa:Annotation` shape (see the query model
   below), and (b) be included in `config/search` if you want them indexed.
   Mismatched shapes just won't render.
4. **No pipeline collision.** The `annotation-job-splitter` dedups on
   `gold:translation` / existing `eli-translation` tasks — annotations in a
   separate graph won't interfere with fresh NER/NEL runs.

## 6. Nominatim (the biggest lift)
On first boot it imports OSM from `PBF_URL` (`belgium-latest.osm.pbf`) into
`./data/nominatim` → ~19 GB, **hours** to build.
- **Ownership gotcha:** the Postgres data dir must be owned by the image's
  postgres user **uid 100:103**. If you copy/restore a prebuilt `data/nominatim`,
  fix it or the container `Exited(1)`:
  ```bash
  docker run --rm -u 0 -v "$PWD/data/nominatim:/data" alpine chown -R 100:103 /data
  ```
- **Strongly recommended:** import once, then **back up `./data/nominatim`** and
  reuse it across deploys to skip the multi-hour rebuild.

## 7. First boot
```bash
# dev/local: docker-compose.dev.yml publishes the app on :80 and relaxes restarts
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```
- **Production**: don't expose `:80` directly — put a reverse proxy / TLS in front
  of the `identifier` service and drop the dev override.
- **Migrations** run automatically (`mu-migrations-service` against Virtuoso from
  `config/migrations`) — watch them: `docker compose logs -f migrations`.
- Virtuoso `:8890` is published for admin/SPARQL (handy; lock it down in prod).

## 8. Smoke tests
```bash
# Virtuoso answering
curl -s localhost:8890/sparql --data-urlencode 'query=SELECT (COUNT(*) AS ?n){?s ?p ?o}' --data-urlencode format=text/csv
# App reachable
curl -s -o /dev/null -w '%{http_code}\n' localhost/   # via dev :80
# AI services fully started (must reach "Application startup complete")
docker compose logs --tail=5 entity-linking named-entity-recognition
# Your existing data is visible THROUGH mu-auth (not just in Virtuoso)
#   -> query a known graph via the app's SPARQL route, confirm non-zero
```
Watch that `entity-linking`/`named-entity-recognition` don't crash on the
provenance step — they read `docker-compose.yml` (mounted at
`/tmp/docker-compose.yaml`) to stamp their version. Keep `COMPOSE_FILE`/
`COMPOSE_SERVICE` and that mount intact.

## 9. Run the pipeline
Frontend → **New annotation job**: graph `public/gent`, property path
`epvoc:expressionContent`, pick the target bestuurseenheid,
`ner-and-nel-annotations`. It runs singleton → split → translating → segmenting →
entity-extracting → named-entity-linking, writing `oa:linking` annotations to
`public/pdf`.

### Consuming the annotations
Full query reference: [`docs/annotation-queries.md`](docs/annotation-queries.md).
Model (all in `public/pdf`, except decision titles which live in `public/gent`):
```
oa:Annotation
 ├─ oa:motivatedBy  oa:linking
 ├─ nif:confidence  0.0–1.0
 ├─ oa:hasTarget ─► oa:SpecificResource
 │                    ├─ oa:hasSource ─► eli:Expression ──eli:realizes──► <decision>/work
 │                    └─ oa:hasSelector ─► oa:TextPositionSelector (oa:start / oa:end)
 └─ oa:hasBody  ─► rdf:Statement { rdf:subject <decision>/work ;
                                   rdf:predicate prov:atLocation ;
                                   rdf:object dct:Location (rdfs:label "…address…") }
```
Example — decisions that mention a location, with title:
```sparql
PREFIX oa:   <http://www.w3.org/ns/oa#>
PREFIX rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX eli:  <http://data.europa.eu/eli/ontology#>
PREFIX nif:  <http://persistence.uni-leipzig.org/nlp2rdf/ontologies/nif-core#>

SELECT DISTINCT ?work ?title ?address WHERE {
  GRAPH <http://mu.semte.ch/graphs/public/pdf> {
    ?ann a oa:Annotation ; oa:motivatedBy oa:linking ;
         nif:confidence ?conf ; oa:hasBody ?st .
    ?st rdf:subject ?work ; rdf:predicate prov:atLocation ; rdf:object ?loc .
    ?loc rdfs:label ?address .
  }
  GRAPH <http://mu.semte.ch/graphs/public/gent> {
    ?work eli:is_realized_by ?expr . ?expr eli:title ?title .
  }
  FILTER(?conf > 0.8)
}
```
Two consumer must-dos: always `DISTINCT` (duplicate `dct:Location` resources per
address) and always filter `nif:confidence` (the pipeline stores everything;
low-confidence rows include geocoding false positives).

## 10. Don't-break-it list
- **`deltanotifier` must stay `nvdk/mu-delta-notifier:1.1.0`** — the pipeline
  relies on `sendMatchesOnly`; upstream `semtech/…:0.4.0` regresses it.
- **`database` stays `sparql-parser:0.0.15`** (not the ODRL feature branch) — this
  fork uses `decide.lisp`, not ODRL.
- **Back up**: `./data/db`, `./data/nominatim`, `./data/files`.
- **Secrets**: never commit `.env`; rotating the Mistral key needs
  `docker compose up -d --force-recreate entity-linking named-entity-recognition`
  (a plain `restart` won't re-read `.env`).
