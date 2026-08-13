const SCHEDULED_STATUS = {
  predicate: {
    type: "uri",
    value: "http://www.w3.org/ns/adms#status",
  },
  object: {
    type: "uri",
    value: "http://redpencil.data.gift/id/concept/JobStatus/scheduled",
  },
};

const HARVEST_SERVICES = [
  "http://harvest_scraper/delta",
  "http://harvest_extract/delta",
  "http://harvest_cleanup/delta",
  "http://harvest_validate/delta",
  "http://harvest_gen_delta/delta",
];

export default [
{
  match: {
    predicate: { type: "uri", value: "http://redpencil.data.gift/vocabularies/tasks/operation" },
    object:    { type: "uri", value: "http://lblod.data.gift/id/jobs/concept/TaskOperation/singleton-job" },
  },
  callback: { method: "POST", url: "http://harvest_singleton-job/delta" },
  options: { resourceFormat: "v0.0.1", gracePeriod: 1000, ignoreFromSelf: true, sendMatchesOnly: true },
},
  // NOTE: the `oparl-to-eli` rule was removed — OPARL harvesting is disabled and
  // that service is not deployed; its failed DNS lookups spammed the delta-notifier.
  ...HARVEST_SERVICES.map((url) => ({
    match: { predicate: SCHEDULED_STATUS.predicate, object: SCHEDULED_STATUS.object },
    callback: { method: "POST", url },
    options: {
      resourceFormat: "v0.0.1",
      gracePeriod: 1000,
      ignoreFromSelf: true,
      sendMatchesOnly: true,
    },
  })),
];
