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
          url: "http://entity-linking/delta",
        },
        options: {
          resourceFormat: "v0.0.1",
          gracePeriod: 1000,
          ignoreFromSelf: true,
          sendMatchesOnly: true,
        },
      },
      // NOTE: the `pdf-content` and `pdf-scraper` rules were removed — those
      // services are disabled in this setup and their failed DNS lookups spammed
      // the delta-notifier. Re-add them if the PDF pipeline is re-enabled.
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
          url: "http://named-entity-recognition/delta",
        },
        options: {
          resourceFormat: "v0.0.1",
          gracePeriod: 1000,
          ignoreFromSelf: true,
          sendMatchesOnly: true,
        },
      },
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
          url: "http://entity-linking/delta",
        },
        options: {
          resourceFormat: "v0.0.1",
          gracePeriod: 1000,
          ignoreFromSelf: true,
          sendMatchesOnly: true,
        },
      },
  ];