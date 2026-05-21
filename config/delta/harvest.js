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
  "http://harvest_singleton-job/delta",
  "http://harvest_scraper/delta",
  "http://harvest_extract/delta",
  "http://harvest_cleanup/delta",
  "http://harvest_validate/delta",
  "http://harvest_gen_delta/delta",
];

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
      url: "http://oparl-to-eli/delta",
      method: "POST",
    },
    options: {
      resourceFormat: "v0.0.1",
      gracePeriod: 1000,
      retry: 0,
      ignoreFromSelf: false,
      retryTimeout: 250,
    },
  },
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