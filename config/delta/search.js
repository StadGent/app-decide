// Disabled for now: neither `search`/`elasticsearch` nor `municipality-linker`
// are running in this setup. These rules matched *all* changes, so their failed
// DNS lookups made the delta-notifier drop changesets and stall unrelated tasks.
// Re-enable the search/update rule once the search + elasticsearch services are
// started (and re-add municipality-linker only if that service is deployed).
export default [];
