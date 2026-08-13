# Querying the location annotations

The NER/NEL pipeline (`ner-and-nel-annotations`) writes location links as
`oa:Annotation` resources. This doc shows the data model and ready-to-run SPARQL
for consuming them.

## Data model

```
oa:Annotation                      (graph: public/pdf)
 ├─ oa:motivatedBy  oa:linking
 ├─ nif:confidence  0.0–1.0
 ├─ oa:hasTarget ─► oa:SpecificResource
 │                    ├─ oa:hasSource ─► eli:Expression ──eli:realizes──► <decision>/work
 │                    └─ oa:hasSelector ─► oa:TextPositionSelector (oa:start / oa:end)
 └─ oa:hasBody  ─► rdf:Statement (reified)
                     ├─ rdf:subject    <decision>/work
                     ├─ rdf:predicate  prov:atLocation
                     └─ rdf:object  ─► dct:Location (rdfs:label "Halewijnstationstraat 35, 9031 Drongen")
```

Two ways from an annotation to its decision:
- via the **body statement** — `?st rdf:subject ?work` (cleanest; also carries the location), or
- via the **target** — `?spec oa:hasSource ?expr . ?expr eli:realizes ?work`.

Both resolve to the same `…/work` URI.

**Graph placement:** annotations, specific-resources, selectors, statements and
locations live in `public/pdf`; decision **titles** (`eli:title`) live in
`public/gent`. Cross-graph joins are expected.

### Prefixes (used throughout)

```sparql
PREFIX oa:    <http://www.w3.org/ns/oa#>
PREFIX rdf:   <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs:  <http://www.w3.org/2000/01/rdf-schema#>
PREFIX prov:  <http://www.w3.org/ns/prov#>
PREFIX dct:   <http://purl.org/dc/terms/>
PREFIX eli:   <http://data.europa.eu/eli/ontology#>
PREFIX nif:   <http://persistence.uni-leipzig.org/nlp2rdf/ontologies/nif-core#>
PREFIX epvoc: <https://data.europarl.europa.eu/def/epvoc#>
```

### Two consumer must-dos
- Always `SELECT DISTINCT` — there are duplicate `dct:Location` resources per
  address (one per mention/decision).
- Always filter `nif:confidence` — the pipeline stores everything (threshold was
  0), and low-confidence rows include geocoding false positives (e.g. a stray
  token `"nt"` geocoded to `"Pl@nt, Berthoutstraat, …, Antwerpen"`). `> 0.8` screens most.

## Query 1 — Which decisions mention a location?

```sparql
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

## Query 2 — Find decisions about a specific place (reverse lookup)

```sparql
SELECT DISTINCT ?work ?title ?address WHERE {
  GRAPH <http://mu.semte.ch/graphs/public/pdf> {
    ?ann oa:motivatedBy oa:linking ; oa:hasBody ?st .
    ?st rdf:subject ?work ; rdf:predicate prov:atLocation ; rdf:object ?loc .
    ?loc rdfs:label ?address .
    FILTER(CONTAINS(LCASE(?address), "halewijnstationstraat"))
  }
  GRAPH <http://mu.semte.ch/graphs/public/gent> {
    ?work eli:is_realized_by ?e . ?e eli:title ?title .
  }
}
```

## Query 3 — With the exact matched text span (for highlighting)

```sparql
SELECT ?work ?address ?start ?end (SUBSTR(?text, ?start + 1, ?end - ?start) AS ?matched) WHERE {
  GRAPH <http://mu.semte.ch/graphs/public/pdf> {
    ?ann oa:motivatedBy oa:linking ; oa:hasBody ?st ;
         oa:hasTarget [ oa:hasSource ?expr ;
                        oa:hasSelector [ oa:start ?start ; oa:end ?end ] ] .
    ?st rdf:subject ?work ; rdf:object ?loc .
    ?loc rdfs:label ?address .
    ?expr epvoc:expressionContent ?text .
  }
}
```
`oa:start`/`oa:end` are character offsets into that expression's
`expressionContent`. Note the source text is the **English translation** the
pipeline linked against, not the original Dutch.

## Query 4 — Aggregate: most-referenced locations

```sparql
SELECT ?address (COUNT(DISTINCT ?work) AS ?decisions) WHERE {
  GRAPH <http://mu.semte.ch/graphs/public/pdf> {
    ?ann oa:motivatedBy oa:linking ; oa:hasBody ?st .
    ?st rdf:subject ?work ; rdf:predicate prov:atLocation ; rdf:object ?loc .
    ?loc rdfs:label ?address .
  }
} GROUP BY ?address ORDER BY DESC(?decisions)
```
