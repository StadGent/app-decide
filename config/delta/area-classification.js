// Wijk (city district) classification, the last step of the
// `ner-and-nel-annotations` chain. See config/job-controller/config.json.
//
// Deliberately narrow: it matches only the transition to `scheduled`, never all
// changes. A rule matching everything and pointing at a service that is down
// makes the delta-notifier drop changesets and stall unrelated tasks -- which is
// why search.js and codelist.js in this directory were emptied.
export default [
  {
    match: {
      predicate: {
        type: "uri",
        value: "http://www.w3.org/ns/adms#status",
      },
      object: {
        type: "uri",
        value: "http://redpencil.data.gift/id/concept/JobStatus/scheduled",
      },
    },
    callback: {
      method: "POST",
      url: "http://area-classification/delta",
    },
    options: {
      resourceFormat: "v0.0.1",
      gracePeriod: 1000,
      ignoreFromSelf: true,
      sendMatchesOnly: true,
    },
  },
];
